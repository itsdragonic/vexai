// Module aliases
const Engine = Matter.Engine,
      Render = Matter.Render,
      World = Matter.World,
      Bodies = Matter.Bodies,
      Body = Matter.Body;

// Create engine
const engine = Engine.create();
engine.world.gravity.x = 0;
engine.world.gravity.y = 0;
const world = engine.world;

// Create renderer
const render = Render.create({
  canvas: document.getElementById('gameCanvas'),
  engine: engine,
  options: {
    width: 800,
    height: 600,
    wireframes: false
  }
});

// Create ground and walls
const ground = Bodies.rectangle(400, 590, 810, 20, { isStatic: true });
const leftWall = Bodies.rectangle(10, 300, 20, 600, { isStatic: true });
const rightWall = Bodies.rectangle(790, 300, 20, 600, { isStatic: true });
const ceiling = Bodies.rectangle(400, 10, 810, 20, { isStatic: true });

// Create goal area
const goal = Bodies.rectangle(750, 300, 100, 100, {
  isStatic: true,
  render: {
    fillStyle: 'rgba(0, 255, 0, 0.5)'
  }
});

// Create agent (blue ball)
const agent = Bodies.circle(400, 300, 20, {
  restitution: 0.9,
  render: {
    fillStyle: 'blue'
  }
});

// Create object to push (red cube)
const box = Bodies.rectangle(100, 300, 40, 40, {
  restitution: 0.5,
  render: {
    fillStyle: 'red'
  }
});

// Add all bodies to the world
World.add(world, [ground, leftWall, rightWall, ceiling, goal, agent, box]);

// Remove this line to avoid double-stepping the engine
// Engine.run(engine);
Render.run(render);

// Define the number of inputs and actions
const num_inputs = 6; // [agent_x, agent_y, box_x, box_y, goal_x, goal_y]
const num_actions = 4; // [up, down, left, right]

// Define the neural network layers
const layer_defs = [];
layer_defs.push({ type: 'input', out_sx: 1, out_sy: 1, out_depth: num_inputs });
layer_defs.push({ type: 'fc', num_neurons: 20, activation: 'relu' });
layer_defs.push({ type: 'fc', num_neurons: num_actions, activation: 'softmax' });

// Define training options
const tdtrainer_options = {
  learning_rate: 0.01,
  momentum: 0.0,
  batch_size: 64,
  l2_decay: 0.01
};

const opt = {
  temporal_window: 1,
  experience_size: 10000,
  start_learn_threshold: 1000,
  gamma: 0.7,
  learning_steps_total: 200000,
  learning_steps_burnin: 3000,
  epsilon_min: 0.05,
  epsilon_test_time: 0.05,
  layer_defs: layer_defs,
  tdtrainer_options: tdtrainer_options
};

// Initialize the brain
const brain = new deepqlearn.Brain(num_inputs, num_actions, opt);

function getState() {
  return [
    agent.position.x / 800,
    agent.position.y / 600,
    box.position.x / 800,
    box.position.y / 600,
    goal.position.x / 800,
    goal.position.y / 600
  ];
}

function applyAction(action) {
  // Increase force to compensate for multiple sim steps per frame
  const baseForce = 0.007;
  const force = baseForce * simSpeed;
  switch (action) {
    case 0: // up
      Body.applyForce(agent, agent.position, { x: 0, y: -force });
      break;
    case 1: // down
      Body.applyForce(agent, agent.position, { x: 0, y: force });
      break;
    case 2: // left
      Body.applyForce(agent, agent.position, { x: -force, y: 0 });
      break;
    case 3: // right
      Body.applyForce(agent, agent.position, { x: force, y: 0 });
      break;
  }
}

function isBoxInGoal() {
  // Check if the box's center is inside the goal rectangle
  return (
    box.position.x > goal.position.x - 50 &&
    box.position.x < goal.position.x + 50 &&
    box.position.y > goal.position.y - 50 &&
    box.position.y < goal.position.y + 50
  );
}

function getReward() {
  if (isBoxInGoal()) {
    return 2; // Large positive reward for success
  }
  // Negative reward for distance between box and goal, plus small step penalty
  const dx = box.position.x - goal.position.x;
  const dy = box.position.y - goal.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return -distance / 800 - 0.01;
}

function resetPositions() {
  Body.setPosition(agent, { x: 400, y: 300 });
  Body.setVelocity(agent, { x: 0, y: 0 });
  Body.setAngularVelocity(agent, 0);
  Body.setAngle(agent, 0);

  Body.setPosition(box, { x: 100, y: 300 });
  Body.setVelocity(box, { x: 0, y: 0 });
  Body.setAngularVelocity(box, 0);
  Body.setAngle(box, 0);
}

let steps = 0;
const maxSteps = 500;
let goalFlash = 0;

// Simulation speed control
let simSpeed = 1;
const speedSlider = document.getElementById('speedSlider');
const speedValue = document.getElementById('speedValue');
if (speedSlider && speedValue) {
  speedSlider.addEventListener('input', function() {
    simSpeed = parseInt(speedSlider.value, 10);
    speedValue.textContent = simSpeed + 'x';
  });
  simSpeed = parseInt(speedSlider.value, 10);
  speedValue.textContent = simSpeed + 'x';
}

// Training time limit (1 minute of in-game time)
const TRAINING_TIME_SECONDS = 60;
const ENGINE_TIMESTEP = 1000 / 60; // ms per step (default 60Hz)
const MAX_TRAINING_STEPS = Math.floor((TRAINING_TIME_SECONDS * 1000) / ENGINE_TIMESTEP);

let totalTrainingSteps = 0;
let trainingDone = false;

function gameLoop() {
  // Run multiple simulation steps per animation frame for speedup
  for (let i = 0; i < simSpeed; i++) {
    if (trainingDone) break;

    const state = getState();
    const action = brain.forward(state);
    applyAction(action);

    const reward = getReward();
    brain.backward(reward);

    steps++;
    totalTrainingSteps++;

    if (isBoxInGoal()) {
      goalFlash = 10;
      resetPositions();
      steps = 0;
    } else if (steps >= maxSteps) {
      resetPositions();
      steps = 0;
    }

    if (totalTrainingSteps >= MAX_TRAINING_STEPS) {
      trainingDone = true;
      break;
    }

    // Visual feedback for goal
    if (goalFlash > 0) {
      goal.render.fillStyle = 'rgba(255,255,0,0.8)';
      goalFlash--;
    } else {
      goal.render.fillStyle = 'rgba(0,255,0,0.5)';
    }

    // Advance Matter.js engine manually for each sim step
    Engine.update(engine, ENGINE_TIMESTEP);
  }

  if (!trainingDone) {
    requestAnimationFrame(gameLoop);
  } else {
    // Optionally, you can display a message or freeze the simulation
    // alert('Training complete!');
  }
}

// Start training immediately on load
gameLoop();