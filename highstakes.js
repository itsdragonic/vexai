function positionBackground() {
    const gameCanvas = document.getElementById('game-canvas');
    const rect = gameCanvas.getBoundingClientRect();
    bgCanvas.style.position = 'absolute';
    bgCanvas.style.left = (rect.left - BORDER_SIZE) + 'px';
    bgCanvas.style.top = (rect.top - BORDER_SIZE) + 'px';
}

function drawBackground() {
    if (fieldImage.complete) {
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.drawImage(fieldImage, 0, 0, bgCanvas.width, bgCanvas.height);
    } else {
    fieldImage.onload = function () {
        drawBackground();
        positionBackground();
    };
    }
}

function createMogo(x, y) {
    return Bodies.polygon(x, y, 6, MOGO_RADIUS, {
    friction: 1.0,
    frictionStatic: 1.0,
    restitution: 0,
    density: 0.5,
    angle: Math.PI / 6,
    render: {
        fillStyle: MOGO_COLOR,
        strokeStyle: '#343720',
        lineWidth: 2
    }
    });
}

// Helper to draw a single ring at a position and angle
function drawSingleRing(ctx, pos, color, angle = 0, innerColor = null) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.arc(0, 0, RING_OUTER_RADIUS, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(0, 0, RING_INNER_RADIUS, 0, 2 * Math.PI, false);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // Draw inner color if provided (for rings on mogos)
    if (innerColor) {
        ctx.beginPath();
        ctx.arc(0, 0, RING_INNER_RADIUS, 0, 2 * Math.PI, false);
        ctx.fillStyle = innerColor;
        ctx.fill();
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = (color == red) ? '#350f0f' : '#0f1d35';
    ctx.beginPath();
    ctx.arc(0, 0, RING_OUTER_RADIUS, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, RING_INNER_RADIUS, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
}

// Utility: check if a point is in a right triangle at a corner
function pointInCornerTriangle(px, py, corner) {
    if (corner === "top-left") {
        return px >= 0 && px <= triSize && py >= 0 && py <= triSize && (px + py <= triSize);
    } else if (corner === "top-right") {
        return px <= FIELD_SIZE && px >= FIELD_SIZE - triSize && py >= 0 && py <= triSize && (FIELD_SIZE - px + py <= triSize);
    } else if (corner === "bottom-left") {
        return px >= 0 && px <= triSize && py <= FIELD_SIZE && py >= FIELD_SIZE - triSize && (px + FIELD_SIZE - py <= triSize);
    } else if (corner === "bottom-right") {
        return px <= FIELD_SIZE && px >= FIELD_SIZE - triSize && py <= FIELD_SIZE && py >= FIELD_SIZE - triSize && (FIELD_SIZE - px + FIELD_SIZE - py <= triSize);
    }
    return false;
}

// Scoreboard logic
// DQ state for each alliance
let redDQ = false;
let blueDQ = false;

function updateScoreboard() {
    let red = 0, blue = 0;

    // --- Store which mogos are in positive corners at t=30s ---
    if (typeof window.positiveCornerMogosAt30 === "undefined") {
        window.positiveCornerMogosAt30 = null;
    }
    if (typeof window.timeLeft !== "undefined" && window.timeLeft === 30) {
        // Find mogos in positive corners at t=30s
        window.positiveCornerMogosAt30 = mogos
            .filter(mogo => pointInCornerTriangle(mogo.position.x, mogo.position.y, "bottom-left") ||
                            pointInCornerTriangle(mogo.position.x, mogo.position.y, "bottom-right"))
            .map(mogo => mogo);
        // Also include attachedMogo if in positive corner
        if (attachedMogo &&
            (pointInCornerTriangle(attachedMogo.position.x, attachedMogo.position.y, "bottom-left") ||
             pointInCornerTriangle(attachedMogo.position.x, attachedMogo.position.y, "bottom-right"))) {
            window.positiveCornerMogosAt30.push(attachedMogo);
        }
    }

    function scoreMogoRings(rings, multiplier) {
        if (!rings || rings.length === 0) return { red: 0, blue: 0 };
        let r = 0, b = 0;
        for (let i = 0; i < rings.length - 1; ++i) {
            if (rings[i] === "red") r += 1 * multiplier;
            else if (rings[i] === "blue") b += 1 * multiplier;
        }
        // Top ring (last in array) is worth 3 * multiplier
        if (rings.length > 0) {
            if (rings[rings.length - 1] === "red") r += 3 * multiplier;
            else if (rings[rings.length - 1] === "blue") b += 3 * multiplier;
        }
        return { red: r, blue: b };
    }

    function getCornerMultiplier(x, y) {
        // After t=30s, only mogos that were in the positive corners at t=30s get the bonus
        if (typeof window.timeLeft !== "undefined" && window.timeLeft < 30) {
            if (window.positiveCornerMogosAt30) {
                // Only double if this mogo is one of the snapshot mogos
                for (const mogo of window.positiveCornerMogosAt30) {
                    if (Math.abs(mogo.position.x - x) < 1 && Math.abs(mogo.position.y - y) < 1) {
                        if (pointInCornerTriangle(x, y, "bottom-left") || pointInCornerTriangle(x, y, "bottom-right")) {
                            return 2;
                        }
                    }
                }
            }
            // Otherwise, no bonus
            if (pointInCornerTriangle(x, y, "top-left") || pointInCornerTriangle(x, y, "top-right")) {
                return -2;
            }
            return 1;
        } else {
            // Before last 30s, normal logic
            if (pointInCornerTriangle(x, y, "bottom-left") || pointInCornerTriangle(x, y, "bottom-right")) {
                return 2; // double points
            }
            if (pointInCornerTriangle(x, y, "top-left") || pointInCornerTriangle(x, y, "top-right")) {
                return -2; // double negative points
            }
            return 1;
        }
    }

    mogos.forEach(mogo => {
        const mx = mogo.position.x;
        const my = mogo.position.y;
        const mult = getCornerMultiplier(mx, my);
        const s = scoreMogoRings(mogo.rings, mult);
        red += s.red;
        blue += s.blue;
    });

    if (attachedMogo) {
        const mx = attachedMogo.position.x;
        const my = attachedMogo.position.y;
        const mult = getCornerMultiplier(mx, my);
        const s = scoreMogoRings(attachedMogo.rings, mult);
        red += s.red;
        blue += s.blue;
    }

    // Score alliance and wall stakes
    pillars.forEach(pillar => {
        // Alliance stakes (x=0 or x=144*inches, y=72*inches)
        if (
            (pillar.position.x === 0 || pillar.position.x === 144 * inches) &&
            pillar.position.y === 72 * inches &&
            pillar.rings && pillar.rings.length > 0
        ) {
            // No multiplier for alliance stakes
            let r = 0, b = 0;
            for (let i = 0; i < pillar.rings.length - 1; ++i) {
                if (pillar.rings[i] === "red") r += 1;
                else if (pillar.rings[i] === "blue") b += 1;
            }
            // Top ring (last in array) is worth 3
            if (pillar.rings[pillar.rings.length - 1] === "red") r += 3;
            else if (pillar.rings[pillar.rings.length - 1] === "blue") b += 3;
            red += r;
            blue += b;
        }
        // Wall stakes (x=72*inches, y=0 or y=144*inches)
        if (
            pillar.position.x === 72 * inches &&
            (pillar.position.y === 0 || pillar.position.y === 144 * inches) &&
            pillar.rings && pillar.rings.length > 0
        ) {
            // No multiplier for wall stakes
            let r = 0, b = 0;
            for (let i = 0; i < pillar.rings.length - 1; ++i) {
                if (pillar.rings[i] === "red") r += 1;
                else if (pillar.rings[i] === "blue") b += 1;
            }
            // Top ring (last in array) is worth 3
            if (pillar.rings[pillar.rings.length - 1] === "red") r += 3;
            else if (pillar.rings[pillar.rings.length - 1] === "blue") b += 3;
            red += r;
            blue += b;
        }
    });

    // Clamp to zero (no negative scores)
    red = Math.max(0, red);
    blue = Math.max(0, blue);

    // Apply DQ: if DQ'd, score is always 0 and display "DQ"
    const redElem = document.getElementById('red-score');
    const blueElem = document.getElementById('blue-score');
    if (redElem) redElem.textContent = redDQ ? "DQ" : red;
    if (blueElem) blueElem.textContent = blueDQ ? "DQ" : blue;
}

// Draws the ring stack indicator for a mogo (6 slots, filled from bottom up)
// Always vertical, not rotated, wider and less tall, fills from bottom up
function drawMogoRingStack(ctx, mogo) {
    const slotCount = 6;
    const slotWidth = 20;
    const slotHeight = 8;
    const slotSpacing = 2;
    const radius = mogo.radius || MOGO_RADIUS;
    // Position to the left of the mogo (relative to field, not angle)
    const offset = radius + 14;
    const baseX = mogo.position.x - offset;
    const baseY = mogo.position.y + ((slotCount - 1) * (slotHeight + slotSpacing)) / 2;

    for (let i = 0; i < slotCount; ++i) {
        const x = baseX;
        const y = baseY - i * (slotHeight + slotSpacing);

        ctx.save();
        ctx.translate(x, y);

        // Draw rounded rectangle (dark gray or colored if filled)
        ctx.beginPath();
        const r = 4;
        ctx.moveTo(-slotWidth / 2 + r, -slotHeight / 2);
        ctx.lineTo(slotWidth / 2 - r, -slotHeight / 2);
        ctx.quadraticCurveTo(slotWidth / 2, -slotHeight / 2, slotWidth / 2, -slotHeight / 2 + r);
        ctx.lineTo(slotWidth / 2, slotHeight / 2 - r);
        ctx.quadraticCurveTo(slotWidth / 2, slotHeight / 2, slotWidth / 2 - r, slotHeight / 2);
        ctx.lineTo(-slotWidth / 2 + r, slotHeight / 2);
        ctx.quadraticCurveTo(-slotWidth / 2, slotHeight / 2, -slotWidth / 2, slotHeight / 2 - r);
        ctx.lineTo(-slotWidth / 2, -slotHeight / 2 + r);
        ctx.quadraticCurveTo(-slotWidth / 2, -slotHeight / 2, -slotWidth / 2 + r, -slotHeight / 2);
        ctx.closePath();

        // Fill with color if this slot is filled (bottom-up), else dark gray
        const ringIdx = i;
        if (mogo.rings && ringIdx < mogo.rings.length) {
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = mogo.rings[ringIdx] === "red" ? red : blue;
        } else {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#222";
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.restore();
    }
}

// Draws the ring stack indicator for alliance/wall stakes
function drawStakeRingStack(ctx, stake, slotCount, side = "left", verticalOffset = 0) {
    const slotWidth = 20;
    const slotHeight = 8;
    const slotSpacing = 2;
    const radius = stake.circleRadius || stake.radius || (2 * inches);

    let baseX = stake.position.x, baseY = stake.position.y;
    let dx = 0, dy = 0;

    if (side === "left") {
        dx = -(radius + 18);
        dy = ((slotCount - 1) * (slotHeight + slotSpacing)) / 2 + verticalOffset;
    } else if (side === "right") {
        dx = radius + 18;
        dy = ((slotCount - 1) * (slotHeight + slotSpacing)) / 2 + verticalOffset;
    }

    // Determine if this is the top wall stake (fill from top to bottom)
    const isTopWallStake = (stake.position.x === 72 * inches && stake.position.y === 0);

    for (let i = 0; i < slotCount; ++i) {
        let x = baseX, y = baseY;
        // Only vertical stacking for all stakes
        x += dx;
        // For top wall stake, fill from top to bottom (first ring fills top slot)
        if (isTopWallStake) {
            y += dy - (slotCount - 1 - i) * (slotHeight + slotSpacing);
        } else {
            y += dy - i * (slotHeight + slotSpacing);
        }

        ctx.save();
        ctx.translate(x, y);

        ctx.beginPath();
        const r = 4;
        ctx.moveTo(-slotWidth / 2 + r, -slotHeight / 2);
        ctx.lineTo(slotWidth / 2 - r, -slotHeight / 2);
        ctx.quadraticCurveTo(slotWidth / 2, -slotHeight / 2, slotWidth / 2, -slotHeight / 2 + r);
        ctx.lineTo(slotWidth / 2, slotHeight / 2 - r);
        ctx.quadraticCurveTo(slotWidth / 2, slotHeight / 2, slotWidth / 2 - r, slotHeight / 2);
        ctx.lineTo(-slotWidth / 2 + r, slotHeight / 2);
        ctx.quadraticCurveTo(-slotWidth / 2, slotHeight / 2, -slotWidth / 2, slotHeight / 2 - r);
        ctx.lineTo(-slotWidth / 2, -slotHeight / 2 + r);
        ctx.quadraticCurveTo(-slotWidth / 2, -slotHeight / 2, -slotWidth / 2 + r, -slotHeight / 2);
        ctx.closePath();

        // Fill with color if this slot is filled (bottom-up for most, top-down for top wall stake)
        let ringIdx;
        if (isTopWallStake) {
            ringIdx = i; // top slot is index 0
        } else {
            ringIdx = i;
        }
        if (stake.rings && ringIdx < stake.rings.length) {
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = stake.rings[ringIdx] === "red" ? red : blue;
        } else {
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = "#222";
        }
        ctx.fill();
        ctx.globalAlpha = 1.0;

        ctx.restore();
    }
}

// Draw shapes

const drawFrontTriangle = (ctx, body) => {
    const angle = body.angle;
    const pos = body.position;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -ROBOT_HEIGHT / 2 + 2);
    ctx.lineTo(-6, -ROBOT_HEIGHT / 2 + 12);
    ctx.lineTo(6, -ROBOT_HEIGHT / 2 + 12);
    ctx.closePath();
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.restore();
};

const drawAttachedMogo = (ctx, hex) => {
    ctx.save();
    ctx.translate(hex.position.x, hex.position.y);
    ctx.rotate(hex.angle);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    const x = Math.cos(angle) * hex.radius;
    const y = Math.sin(angle) * hex.radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = hex.color;
    ctx.fill();
    ctx.strokeStyle = '#343720';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
};

const drawRings = (ctx) => {
    rings.forEach(({ outer, color }) => {
        const x = outer.position.x;
        const y = outer.position.y;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, RING_OUTER_RADIUS, 0, 2 * Math.PI, false);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, RING_INNER_RADIUS, 0, 2 * Math.PI, false);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        
        if (color == red) {
            ctx.strokeStyle = '#350f0f';
        } else {
            ctx.strokeStyle = '#0f1d35';
        }

        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, RING_OUTER_RADIUS, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y, RING_INNER_RADIUS, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.restore();
    });
};