import { createCanvas, SKRSContext2D } from '@napi-rs/canvas';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export type StickmanActionType =
  | 'WALK_CONFIDENT'
  | 'PULL_HANDLE_HARD'
  | 'BRACE_FOOT_AND_FALL'
  | 'CROWBAR_PRY_SPARKS'
  | 'FLYING_KICK_BOUNCE'
  | 'THINK_LIGHTBULB_IDEA'
  | 'PUSH_OPEN_AND_EXIT'
  | 'SWAT_MOSQUITO_CHAOS'
  | 'SPIDER_PANIC_BROOM'
  | 'GYM_HEAVY_BARBELL';

export type StickmanPropType = 'DOOR' | 'MOSQUITO' | 'SPIDER' | 'GYM_BARBELL';

export interface StickmanChoreographyScene {
  sceneNumber: number;
  title: string;
  actionType: StickmanActionType;
  propType: StickmanPropType;
  durationSec: number;
  narrationText?: string;
}

interface Point {
  x: number;
  y: number;
}

interface StickmanPose {
  // Root position (hip center) in 720x1280 canvas
  hipX: number;
  hipY: number;
  // Torso angle in radians (0 = upright, negative = leaning left/back, positive = leaning right/forward)
  torsoAngle: number;
  // Head offset / nod angle
  headTilt: number;
  lookDirX: number; // -1 to 1
  lookDirY: number; // -1 to 1
  expression: 'SMUG' | 'CONFIDENT' | 'WORRIED' | 'STRAIN' | 'EXTREME_STRAIN' | 'PAIN_FALL' | 'THINKING' | 'IDEA' | 'SHOCKED';
  // Hand & Foot targets in world coordinates (IK solver computes elbow & knee)
  leftHand: { x: number; y: number };
  rightHand: { x: number; y: number };
  leftFoot: { x: number; y: number };
  rightFoot: { x: number; y: number };
  // Scene prop state
  doorOpenAngle: number; // 0 = closed, 1 = fully open inward
  doorShakeX: number;
  showLightbulb: number; // 0 to 1
  showCrowbar: boolean;
  showImpactBurst: { x: number; y: number; scale: number } | null;
  sweatDrops: number; // 0 to 1
  cameraZoom: number;
  cameraPanX: number;
  cameraPanY: number;
  extraPropTime: number;
}

function lerp(a: number, b: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return a + (b - a) * clamped;
}

function easeInOutQuad(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function easeOutBack(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(c - 1, 3) + c1 * Math.pow(c - 1, 2);
}

/**
 * 2-bone analytic Inverse Kinematics solver for arms and legs.
 */
function solveTwoBoneIK(
  rootX: number,
  rootY: number,
  targetX: number,
  targetY: number,
  len1: number,
  len2: number,
  bendDirection: 1 | -1
): { midX: number; midY: number; endX: number; endY: number } {
  const dx = targetX - rootX;
  const dy = targetY - rootY;
  const distRaw = Math.hypot(dx, dy);
  const maxReach = len1 + len2 - 0.5;
  const dist = Math.max(8, Math.min(maxReach, distRaw));

  const baseAngle = Math.atan2(dy, dx);
  const cosAngle1 = Math.max(
    -1,
    Math.min(1, (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist))
  );
  const angle1 = baseAngle + bendDirection * Math.acos(cosAngle1);

  const midX = rootX + Math.cos(angle1) * len1;
  const midY = rootY + Math.sin(angle1) * len1;

  const endX = distRaw > maxReach ? rootX + Math.cos(baseAngle) * maxReach : targetX;
  const endY = distRaw > maxReach ? rootY + Math.sin(baseAngle) * maxReach : targetY;

  return { midX, midY, endX, endY };
}

/**
 * Draws the exact mint-green 3D perspective room and brown wooden door from the reference video.
 */
function drawRoomAndDoor(ctx: SKRSContext2D, W: number, H: number, pose: StickmanPose, propType: StickmanPropType) {
  const cornerX = 250;
  const ceilingCornerY = 175;
  const floorCornerY = 935;

  // Back/Right wall (#CBEAE7)
  ctx.fillStyle = '#CBEAE7';
  ctx.fillRect(0, 0, W, H);

  // Left perspective wall (#BCE0DD)
  ctx.fillStyle = '#BCE0DD';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(cornerX, ceilingCornerY);
  ctx.lineTo(cornerX, floorCornerY);
  ctx.lineTo(0, 935);
  ctx.closePath();
  ctx.fill();

  // Ceiling triangle (#B2DAD6)
  ctx.fillStyle = '#B2DAD6';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(cornerX, ceilingCornerY);
  ctx.closePath();
  ctx.fill();

  // Floor polygon (#B5DBD8)
  ctx.fillStyle = '#B5DBD8';
  ctx.beginPath();
  ctx.moveTo(0, 935);
  ctx.lineTo(cornerX, floorCornerY);
  ctx.lineTo(W, 1175);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

  // Subtle architectural corner lines
  ctx.strokeStyle = '#8FB8B5';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(cornerX, ceilingCornerY);
  ctx.lineTo(cornerX, floorCornerY);
  ctx.moveTo(0, 935);
  ctx.lineTo(cornerX, floorCornerY);
  ctx.lineTo(W, 1175);
  ctx.moveTo(0, 0);
  ctx.lineTo(cornerX, ceilingCornerY);
  ctx.stroke();

  // Draw the perspective brown wooden door on the right wall
  const sx = pose.doorShakeX || 0;
  const doorLeftX = 430 + sx;
  const doorRightX = 655 + sx;
  const doorTopLeftY = 235;
  const doorTopRightY = 140;
  const doorBotLeftY = 1045;
  const doorBotRightY = 1165;

  // Doorway interior (visible when door opens)
  ctx.fillStyle = '#92B8BA';
  ctx.beginPath();
  ctx.moveTo(doorLeftX, doorTopLeftY);
  ctx.lineTo(doorRightX, doorTopRightY);
  ctx.lineTo(doorRightX, doorBotRightY);
  ctx.lineTo(doorLeftX, doorBotLeftY);
  ctx.closePath();
  ctx.fill();

  // Outer wooden door frame
  ctx.strokeStyle = '#5E3A1E';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(doorLeftX, doorBotLeftY);
  ctx.lineTo(doorLeftX, doorTopLeftY);
  ctx.lineTo(doorRightX, doorTopRightY);
  ctx.lineTo(doorRightX, doorBotRightY);
  ctx.stroke();

  // Door leaf hinged on the right side (doorRightX) swinging inward as doorOpenAngle goes 0 -> 1
  const openAmt = Math.max(0, Math.min(1, pose.doorOpenAngle));
  const freeEdgeX = lerp(doorLeftX, doorRightX - 45, openAmt);
  const freeTopY = lerp(doorTopLeftY, doorTopRightY + 35, openAmt);
  const freeBotY = lerp(doorBotLeftY, doorBotRightY - 40, openAmt);

  ctx.fillStyle = '#8B5A36';
  ctx.strokeStyle = '#3B2311';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(freeEdgeX, freeTopY);
  ctx.lineTo(doorRightX, doorTopRightY);
  ctx.lineTo(doorRightX, doorBotRightY);
  ctx.lineTo(freeEdgeX, freeBotY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Metallic lock plate & round doorknob near the left (free) edge of the door
  const knobX = lerp(freeEdgeX + 36, doorRightX - 18, openAmt * 0.5);
  const knobY = lerp((freeTopY + freeBotY) * 0.52, (doorTopRightY + doorBotRightY) * 0.52, openAmt * 0.3);

  // Silver backplate
  ctx.fillStyle = '#B8C0C8';
  ctx.strokeStyle = '#2B2B2B';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(knobX - 9, knobY - 26, 16, 52, 4);
  ctx.fill();
  ctx.stroke();

  // Protruding round silver knob
  ctx.fillStyle = '#DCE2E8';
  ctx.beginPath();
  ctx.arc(knobX - 10, knobY, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Extra props depending on story topic
  if (propType === 'MOSQUITO') {
    const t = pose.extraPropTime;
    const mx = 340 + Math.sin(t * 9.5) * 150 + Math.cos(t * 4.2) * 55;
    const my = 430 + Math.cos(t * 7.8) * 110;
    // Animated flying mosquito with buzzing wings
    ctx.save();
    ctx.translate(mx, my);
    ctx.fillStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.ellipse(-6, -10 + Math.sin(t * 60) * 6, 14, 6, -0.4, 0, Math.PI * 2);
    ctx.ellipse(6, -10 - Math.sin(t * 60) * 6, 14, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-12, 2);
    ctx.lineTo(-26, 8);
    ctx.stroke();
    ctx.restore();
  } else if (propType === 'SPIDER') {
    const t = pose.extraPropTime;
    const sy = 360 + Math.sin(t * 3.2) * 70;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(410, 140);
    ctx.lineTo(410, sy);
    ctx.stroke();
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(410, sy, 14, 0, Math.PI * 2);
    ctx.fill();
    for (let leg = -1; leg <= 1; leg += 1) {
      ctx.beginPath();
      ctx.moveTo(396, sy + leg * 5);
      ctx.lineTo(382, sy + leg * 11 + Math.sin(t * 14 + leg) * 4);
      ctx.moveTo(424, sy + leg * 5);
      ctx.lineTo(438, sy + leg * 11 - Math.sin(t * 14 + leg) * 4);
      ctx.stroke();
    }
  } else if (propType === 'GYM_BARBELL') {
    const bx = 360;
    const by = 995;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(bx - 130, by);
    ctx.lineTo(bx + 130, by);
    ctx.stroke();
    ctx.fillStyle = '#0F172A';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(bx + side * 115, by, 22, 68, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(bx + side * 138, by, 16, 52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/**
 * Draws the expressive 2D white stickman with bean torso, big cartoon head, eyes, eyebrows, mouth, and IK limbs.
 */
function drawStickmanCharacter(ctx: SKRSContext2D, pose: StickmanPose) {
  const hipX = pose.hipX;
  const hipY = pose.hipY;

  // Shoulder & Neck position derived from hip + torsoAngle
  const torsoLen = 155;
  const shoulderX = hipX + Math.sin(pose.torsoAngle) * torsoLen;
  const shoulderY = hipY - Math.cos(pose.torsoAngle) * torsoLen;

  const headRadius = 74;
  const headCenterX = shoulderX + Math.sin(pose.torsoAngle * 0.6 + pose.headTilt) * (headRadius + 8);
  const headCenterY = shoulderY - Math.cos(pose.torsoAngle * 0.6 + pose.headTilt) * (headRadius + 8);

  // 1. Floor drop shadow under character
  const shadowY = Math.max(pose.leftFoot.y, pose.rightFoot.y) + 8;
  ctx.fillStyle = 'rgba(70, 105, 102, 0.28)';
  ctx.beginPath();
  ctx.ellipse(hipX, shadowY, 95, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // Solve IK for Legs (thigh = 122, shin = 122)
  const leftLeg = solveTwoBoneIK(hipX - 14, hipY, pose.leftFoot.x, pose.leftFoot.y, 122, 122, -1);
  const rightLeg = solveTwoBoneIK(hipX + 14, hipY, pose.rightFoot.x, pose.rightFoot.y, 122, 122, -1);

  // Solve IK for Arms (upper = 124, forearm = 124 so hands reach the doorknob cleanly)
  const leftArm = solveTwoBoneIK(shoulderX - 10, shoulderY + 12, pose.leftHand.x, pose.leftHand.y, 124, 124, 1);
  const rightArm = solveTwoBoneIK(shoulderX + 10, shoulderY + 12, pose.rightHand.x, pose.rightHand.y, 124, 124, 1);

  const drawLimbLeg = (rootX: number, rootY: number, ik: { midX: number; midY: number; endX: number; endY: number }) => {
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 8.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.lineTo(ik.midX, ik.midY);
    ctx.lineTo(ik.endX, ik.endY);
    ctx.stroke();

    // Black cartoon shoe
    ctx.fillStyle = '#111318';
    ctx.beginPath();
    ctx.ellipse(ik.endX + 16, ik.endY + 2, 24, 10, 0.08, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawLimbArm = (rootX: number, rootY: number, ik: { midX: number; midY: number; endX: number; endY: number }) => {
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(rootX, rootY);
    ctx.lineTo(ik.midX, ik.midY);
    ctx.lineTo(ik.endX, ik.endY);
    ctx.stroke();

    // Expressive black cartoon hand/glove
    ctx.fillStyle = '#111318';
    ctx.beginPath();
    ctx.arc(ik.endX, ik.endY, 13, 0, Math.PI * 2);
    ctx.fill();
  };

  // Back leg & back arm first
  drawLimbLeg(hipX - 12, hipY, leftLeg);
  drawLimbArm(shoulderX - 8, shoulderY + 14, leftArm);

  // 2. White bean-shaped torso with soft cel-shaded shadow and thick black outline
  ctx.save();
  ctx.translate((hipX + shoulderX) / 2, (hipY + shoulderY) / 2);
  ctx.rotate(pose.torsoAngle);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#111318';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, torsoLen * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();

  // Subtle gray-blue cel shading on left side of torso
  ctx.fillStyle = '#DCE6EA';
  ctx.beginPath();
  ctx.ellipse(-14, 4, 16, torsoLen * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, 38, torsoLen * 0.52, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Optional red crowbar prop in hands
  if (pose.showCrowbar) {
    ctx.save();
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rightArm.endX - 35, rightArm.endY + 30);
    ctx.lineTo(rightArm.endX + 55, rightArm.endY - 25);
    ctx.lineTo(rightArm.endX + 72, rightArm.endY - 10);
    ctx.stroke();
    ctx.restore();
  }

  // Front leg & front arm
  drawLimbLeg(hipX + 12, hipY, rightLeg);
  drawLimbArm(shoulderX + 8, shoulderY + 14, rightArm);

  // 3. Large White Cartoon Head
  ctx.save();
  ctx.translate(headCenterX, headCenterY);
  ctx.rotate(pose.headTilt);

  // Base white sphere
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#111318';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, headRadius, 0, Math.PI * 2);
  ctx.fill();

  // Subtle cel-shading crescent on left edge of head
  ctx.fillStyle = '#E2ECEF';
  ctx.beginPath();
  ctx.arc(-10, 6, headRadius - 4, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();

  // Re-stroke head outline cleanly
  ctx.beginPath();
  ctx.arc(0, 0, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  // 4. Expressive Cartoon Eyes & Mouth matching reference sheet (`all.png`)
  const eyeCenterX = 18;
  const eyeY = -8;
  const leftEyeX = eyeCenterX - 22;
  const rightEyeX = eyeCenterX + 18;

  if (pose.expression === 'EXTREME_STRAIN' || pose.expression === 'PAIN_FALL') {
    // Tightly squinting eyes (><) with angled brows
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 4.2;
    // Left squinted eye
    ctx.beginPath();
    ctx.arc(leftEyeX, eyeY, 17, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 10, eyeY - 6);
    ctx.lineTo(leftEyeX + 8, eyeY + 2);
    ctx.lineTo(leftEyeX - 10, eyeY + 9);
    ctx.stroke();

    // Right squinted eye
    ctx.beginPath();
    ctx.arc(rightEyeX, eyeY, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rightEyeX + 10, eyeY - 6);
    ctx.lineTo(rightEyeX - 8, eyeY + 2);
    ctx.lineTo(rightEyeX + 10, eyeY + 9);
    ctx.stroke();
  } else {
    // Big oval cartoon eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 3.5;

    ctx.beginPath();
    ctx.ellipse(leftEyeX, eyeY, 17, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(rightEyeX, eyeY, 17, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Half-lowered eyelids for SMUG / CONFIDENT / IDEA expressions
    if (pose.expression === 'SMUG' || pose.expression === 'CONFIDENT' || pose.expression === 'IDEA') {
      ctx.fillStyle = '#E2ECEF';
      for (const ex of [leftEyeX, rightEyeX]) {
        ctx.beginPath();
        ctx.ellipse(ex, eyeY - 9, 16, 11, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ex - 16, eyeY - 4);
        ctx.lineTo(ex + 16, eyeY - 4);
        ctx.stroke();
      }
    }

    // Pupils
    const px = pose.lookDirX * 6;
    const py = pose.lookDirY * 5;
    ctx.fillStyle = '#111318';
    ctx.beginPath();
    ctx.arc(leftEyeX + px, eyeY + py, 5.5, 0, Math.PI * 2);
    ctx.arc(rightEyeX + px, eyeY + py, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyebrows
  ctx.strokeStyle = '#111318';
  ctx.lineWidth = 4;
  if (pose.expression === 'STRAIN' || pose.expression === 'EXTREME_STRAIN') {
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 14, eyeY - 26);
    ctx.lineTo(leftEyeX + 12, eyeY - 16);
    ctx.moveTo(rightEyeX + 14, eyeY - 26);
    ctx.lineTo(rightEyeX - 12, eyeY - 16);
    ctx.stroke();
  } else if (pose.expression === 'WORRIED' || pose.expression === 'THINKING') {
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 14, eyeY - 18);
    ctx.lineTo(leftEyeX + 10, eyeY - 27);
    ctx.moveTo(rightEyeX - 10, eyeY - 27);
    ctx.lineTo(rightEyeX + 14, eyeY - 18);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 12, eyeY - 24);
    ctx.quadraticCurveTo(leftEyeX, eyeY - 30, leftEyeX + 12, eyeY - 23);
    ctx.moveTo(rightEyeX - 12, eyeY - 23);
    ctx.quadraticCurveTo(rightEyeX, eyeY - 30, rightEyeX + 12, eyeY - 24);
    ctx.stroke();
  }

  // Mouth
  ctx.strokeStyle = '#111318';
  ctx.lineWidth = 3.8;
  if (pose.expression === 'SMUG' || pose.expression === 'CONFIDENT' || pose.expression === 'IDEA') {
    ctx.beginPath();
    ctx.arc(16, 22, 18, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (pose.expression === 'STRAIN' || pose.expression === 'EXTREME_STRAIN') {
    // Wavy grimace mouth from reference frames
    ctx.beginPath();
    ctx.moveTo(-2, 32);
    ctx.quadraticCurveTo(8, 24, 16, 32);
    ctx.quadraticCurveTo(24, 40, 34, 30);
    ctx.stroke();
  } else if (pose.expression === 'PAIN_FALL') {
    // Open shouting/gritting mouth
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(0, 22, 34, 20, 6);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2, 32);
    ctx.lineTo(32, 32);
    ctx.stroke();
  } else {
    // Worried/frown curve
    ctx.beginPath();
    ctx.arc(18, 40, 14, 1.15 * Math.PI, 1.85 * Math.PI);
    ctx.stroke();
  }

  // Sweat drops when straining
  if (pose.sweatDrops > 0) {
    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 2;
    const dropOffset = (pose.sweatDrops * 25) % 25;
    ctx.beginPath();
    ctx.ellipse(-48, -20 + dropOffset, 6, 11, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Glowing Yellow Idea Lightbulb (`💡`) above the head (exact match to frame 15-16 of reference)
  if (pose.showLightbulb > 0) {
    const sc = easeOutBack(pose.showLightbulb);
    ctx.save();
    ctx.translate(0, -headRadius - 58);
    ctx.scale(sc, sc);

    // Glow rays
    ctx.strokeStyle = '#FACC15';
    ctx.lineWidth = 4;
    for (let a = 0; a < 7; a++) {
      const ang = -Math.PI + (a / 6) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * 34, Math.sin(ang) * 34);
      ctx.lineTo(Math.cos(ang) * 48, Math.sin(ang) * 48);
      ctx.stroke();
    }

    // Yellow bulb glass
    ctx.fillStyle = '#FDE047';
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(0, 0, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Screw base
    ctx.fillStyle = '#94A3B8';
    ctx.beginPath();
    ctx.roundRect(-10, 20, 20, 12, 3);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // Comic impact burst / sparks
  if (pose.showImpactBurst) {
    const { x, y, scale } = pose.showImpactBurst;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#FACC15';
    ctx.fillStyle = '#FEF08A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const r = i % 2 === 0 ? 44 : 18;
      const ang = (i * Math.PI) / 6;
      const px = Math.cos(ang) * r;
      const py = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Computes the exact 24fps skeletal pose for a given StickmanActionType and normalized time u in [0, 1].
 */
export function evaluateStickmanScenePose(
  actionType: StickmanActionType,
  u: number,
  timeSec: number
): StickmanPose {
  const basePose: StickmanPose = {
    hipX: 250,
    hipY: 790,
    torsoAngle: 0,
    headTilt: 0,
    lookDirX: 1,
    lookDirY: 0,
    expression: 'CONFIDENT',
    leftHand: { x: 210, y: 740 },
    rightHand: { x: 290, y: 740 },
    leftFoot: { x: 215, y: 1015 },
    rightFoot: { x: 285, y: 1015 },
    doorOpenAngle: 0,
    doorShakeX: 0,
    showLightbulb: 0,
    showCrowbar: false,
    showImpactBurst: null,
    sweatDrops: 0,
    cameraZoom: 1.0,
    cameraPanX: 0,
    cameraPanY: 0,
    extraPropTime: timeSec,
  };

  if (actionType === 'WALK_CONFIDENT') {
    // First 60%: walk from left (x=115) to x=255 with realistic 2-step cycle; then hands on hips & reach for knob
    if (u < 0.55) {
      const p = u / 0.55;
      const hx = lerp(115, 255, p);
      const stepPhase = p * Math.PI * 6;
      const bob = Math.abs(Math.sin(stepPhase)) * 14;
      return {
        ...basePose,
        hipX: hx,
        hipY: 790 - bob,
        torsoAngle: 0.06,
        expression: 'SMUG',
        leftFoot: {
          x: hx + Math.sin(stepPhase) * 55,
          y: 1015 - Math.max(0, Math.cos(stepPhase)) * 28,
        },
        rightFoot: {
          x: hx - Math.sin(stepPhase) * 55,
          y: 1015 - Math.max(0, -Math.cos(stepPhase)) * 28,
        },
        leftHand: {
          x: hx - Math.sin(stepPhase) * 45,
          y: 745 + Math.cos(stepPhase) * 18,
        },
        rightHand: {
          x: hx + Math.sin(stepPhase) * 45,
          y: 745 - Math.cos(stepPhase) * 18,
        },
      };
    } else if (u < 0.8) {
      // Stand confidently with hands on hips (frames 3-4 of reference)
      return {
        ...basePose,
        hipX: 255,
        hipY: 790,
        torsoAngle: -0.04,
        expression: 'SMUG',
        leftHand: { x: 215, y: 745 },
        rightHand: { x: 292, y: 745 },
        leftFoot: { x: 210, y: 1015 },
        rightFoot: { x: 300, y: 1015 },
      };
    } else {
      // Reach out right hand to grab the doorknob at (456, 650)
      const p = easeInOutQuad((u - 0.8) / 0.2);
      return {
        ...basePose,
        hipX: lerp(255, 310, p),
        hipY: 790,
        torsoAngle: lerp(-0.04, 0.16, p),
        expression: 'CONFIDENT',
        leftHand: { x: lerp(215, 265, p), y: lerp(745, 730, p) },
        rightHand: { x: lerp(292, 456, p), y: lerp(745, 650, p) },
        leftFoot: { x: lerp(210, 250, p), y: 1015 },
        rightFoot: { x: lerp(300, 365, p), y: 1020 },
      };
    }
  }

  if (actionType === 'PULL_HANDLE_HARD') {
    // Both hands locked on doorknob (455, 650), body leans way back pulling rhythmically (frames 6-8 of reference)
    const pullCycle = Math.sin(u * Math.PI * 5);
    const leanAmt = 0.24 + Math.max(0, pullCycle) * 0.16;
    const jitter = Math.sin(u * 90) * 3.5;
    return {
      ...basePose,
      hipX: 295 - Math.max(0, pullCycle) * 22 + jitter,
      hipY: 800 + Math.max(0, pullCycle) * 16,
      torsoAngle: -leanAmt,
      headTilt: -0.08,
      expression: pullCycle > 0.2 ? 'STRAIN' : 'WORRIED',
      leftHand: { x: 452 + jitter, y: 646 },
      rightHand: { x: 458 + jitter, y: 654 },
      leftFoot: { x: 345, y: 1020 },
      rightFoot: { x: 405, y: 1025 },
      doorShakeX: jitter * 0.7,
      sweatDrops: u,
      cameraZoom: 1.08,
    };
  }

  if (actionType === 'BRACE_FOOT_AND_FALL') {
    // First 62%: braces right foot high on the door (435, 895) and pulls with extreme >< face (frames 9-11)
    // Last 38%: hands slip off knob, flies backward and lands sitting on floor rubbing head (frames 12-14)
    if (u < 0.62) {
      const p = u / 0.62;
      const shake = Math.sin(p * 110) * 5;
      return {
        ...basePose,
        hipX: 285 - p * 18 + shake,
        hipY: 798 + p * 14,
        torsoAngle: -0.32 - p * 0.1,
        headTilt: -0.15,
        expression: 'EXTREME_STRAIN',
        leftHand: { x: 450 + shake, y: 645 },
        rightHand: { x: 456 + shake, y: 653 },
        leftFoot: { x: 315, y: 1025 },
        rightFoot: { x: 432, y: 885 }, // Foot braced against door!
        doorShakeX: shake * 0.85,
        sweatDrops: p,
        cameraZoom: 1.12,
      };
    } else {
      const p = easeInOutQuad((u - 0.62) / 0.38);
      const sitHipX = lerp(195, 165, p);
      const sitHipY = lerp(815, 975, Math.min(1, p * 1.4));
      const rubbingHead = p > 0.55;
      return {
        ...basePose,
        hipX: sitHipX,
        hipY: sitHipY,
        torsoAngle: lerp(-0.55, -0.22, p),
        headTilt: rubbingHead ? 0.1 : -0.25,
        expression: rubbingHead ? 'THINKING' : 'PAIN_FALL',
        leftHand: rubbingHead
          ? { x: sitHipX - 45, y: 1010 }
          : { x: sitHipX + 85, y: sitHipY - 120 },
        rightHand: rubbingHead
          ? { x: sitHipX + 25, y: sitHipY - 195 } // scratching head
          : { x: sitHipX + 115, y: sitHipY - 95 },
        leftFoot: { x: sitHipX + 115, y: 1015 },
        rightFoot: { x: sitHipX + 145, y: 1025 },
      };
    }
  }

  if (actionType === 'CROWBAR_PRY_SPARKS') {
    const pump = Math.sin(u * Math.PI * 6);
    const shake = Math.sin(u * 85) * 4;
    return {
      ...basePose,
      hipX: 255 + pump * 18 + shake,
      hipY: 800 + Math.abs(pump) * 14,
      torsoAngle: 0.18 + pump * 0.16,
      expression: pump > 0 ? 'EXTREME_STRAIN' : 'STRAIN',
      leftHand: { x: 385, y: 680 + pump * 22 },
      rightHand: { x: 405, y: 670 + pump * 22 },
      leftFoot: { x: 205, y: 1015 },
      rightFoot: { x: 335, y: 1020 },
      showCrowbar: true,
      doorShakeX: shake,
      sweatDrops: u,
      showImpactBurst:
        pump > 0.45 ? { x: 452, y: 650, scale: 0.7 + (pump - 0.45) * 1.1 } : null,
      cameraZoom: 1.1,
    };
  }

  if (actionType === 'FLYING_KICK_BOUNCE') {
    // 0..0.35 windup, 0.35..0.60 airborne karate kick into door, 0.60..1.0 bounce onto floor
    if (u < 0.35) {
      const p = easeInOutQuad(u / 0.35);
      return {
        ...basePose,
        hipX: lerp(210, 140, p),
        hipY: lerp(790, 825, p),
        torsoAngle: lerp(0, -0.25, p),
        expression: 'STRAIN',
        leftHand: { x: 110, y: 740 },
        rightHand: { x: 195, y: 710 },
        leftFoot: { x: 110, y: 1015 },
        rightFoot: { x: 210, y: 1015 },
      };
    } else if (u < 0.62) {
      const p = easeInOutQuad((u - 0.35) / 0.27);
      const hx = lerp(140, 320, p);
      const hy = lerp(825, 670, Math.sin(p * Math.PI));
      return {
        ...basePose,
        hipX: hx,
        hipY: hy,
        torsoAngle: -0.45,
        expression: 'EXTREME_STRAIN',
        leftHand: { x: hx - 60, y: hy - 90 },
        rightHand: { x: hx + 50, y: hy - 70 },
        leftFoot: { x: hx - 55, y: hy + 110 },
        rightFoot: { x: lerp(hx + 40, 445, p), y: hy + 10 }, // Flying kick foot!
        doorShakeX: p > 0.75 ? Math.sin(p * 120) * 9 : 0,
        showImpactBurst: p > 0.72 ? { x: 448, y: 675, scale: 1.25 } : null,
        cameraZoom: 1.14,
      };
    } else {
      const p = easeInOutQuad((u - 0.62) / 0.38);
      return {
        ...basePose,
        hipX: lerp(290, 185, p),
        hipY: lerp(700, 975, p),
        torsoAngle: -0.35,
        expression: 'PAIN_FALL',
        leftHand: { x: 145, y: 995 },
        rightHand: { x: 225, y: 940 },
        leftFoot: { x: 295, y: 1015 },
        rightFoot: { x: 335, y: 1020 },
      };
    }
  }

  if (actionType === 'THINK_LIGHTBULB_IDEA') {
    // Rises from sitting on floor -> stands thinking -> lightbulb pops above head! (frames 14-16 of reference)
    if (u < 0.4) {
      const p = easeInOutQuad(u / 0.4);
      const hy = lerp(965, 795, p);
      return {
        ...basePose,
        hipX: lerp(175, 235, p),
        hipY: hy,
        torsoAngle: lerp(-0.2, 0.05, p),
        expression: 'THINKING',
        leftHand: { x: 195, y: hy - 35 },
        rightHand: { x: 255, y: hy - 180 },
        leftFoot: { x: 195, y: 1015 },
        rightFoot: { x: 275, y: 1015 },
      };
    } else {
      const bulbProgress = Math.min(1, (u - 0.4) / 0.25);
      return {
        ...basePose,
        hipX: 245,
        hipY: 790,
        torsoAngle: 0.04,
        expression: 'IDEA',
        leftHand: { x: 195, y: 760 },
        rightHand: { x: 325, y: 715 },
        leftFoot: { x: 205, y: 1015 },
        rightFoot: { x: 285, y: 1015 },
        showLightbulb: bulbProgress,
        cameraZoom: 1.06,
      };
    }
  }

  if (actionType === 'PUSH_OPEN_AND_EXIT') {
    // Gently pushes the door inward with one hand, door swings open (doorOpenAngle 0 -> 1), walks right through doorway (frames 17-20)
    if (u < 0.45) {
      const p = easeInOutQuad(u / 0.45);
      return {
        ...basePose,
        hipX: lerp(250, 315, p),
        hipY: 790,
        torsoAngle: lerp(0.05, 0.16, p),
        expression: 'SMUG',
        leftHand: { x: lerp(205, 255, p), y: 755 },
        rightHand: { x: lerp(330, 470, p), y: 665 },
        leftFoot: { x: lerp(210, 265, p), y: 1015 },
        rightFoot: { x: lerp(285, 360, p), y: 1015 },
        doorOpenAngle: p * 0.85,
      };
    } else {
      const p = (u - 0.45) / 0.55;
      const hx = lerp(315, 640, p);
      const stepPhase = p * Math.PI * 5;
      return {
        ...basePose,
        hipX: hx,
        hipY: 790 - Math.abs(Math.sin(stepPhase)) * 12,
        torsoAngle: 0.05,
        lookDirX: -0.6, // Looks back smugly at the viewer while exiting!
        expression: 'SMUG',
        leftHand: { x: hx - 35, y: 740 + Math.sin(stepPhase) * 20 },
        rightHand: { x: hx + 35, y: 740 - Math.sin(stepPhase) * 20 },
        leftFoot: { x: hx + Math.sin(stepPhase) * 48, y: 1015 },
        rightFoot: { x: hx - Math.sin(stepPhase) * 48, y: 1015 },
        doorOpenAngle: lerp(0.85, 1.0, p),
      };
    }
  }

  if (actionType === 'SWAT_MOSQUITO_CHAOS' || actionType === 'SPIDER_PANIC_BROOM') {
    const wave = Math.sin(u * Math.PI * 8);
    const jump = Math.abs(Math.cos(u * Math.PI * 4)) * 45;
    const hx = 280 + Math.sin(u * Math.PI * 3) * 75;
    return {
      ...basePose,
      hipX: hx,
      hipY: 790 - jump,
      torsoAngle: wave * 0.25,
      expression: wave > 0 ? 'EXTREME_STRAIN' : 'SHOCKED',
      leftHand: { x: hx - 65, y: 640 - wave * 70 },
      rightHand: { x: hx + 85, y: 580 + wave * 85 },
      leftFoot: { x: hx - 45, y: 1015 - jump * 0.6 },
      rightFoot: { x: hx + 45, y: 1015 - jump * 0.6 },
      showCrowbar: actionType === 'SPIDER_PANIC_BROOM',
      sweatDrops: u,
    };
  }

  // GYM_HEAVY_BARBELL
  const strainShake = Math.sin(u * 100) * 4.5;
  return {
    ...basePose,
    hipX: 360 + strainShake,
    hipY: 855 + Math.sin(u * Math.PI) * 25,
    torsoAngle: 0.35,
    expression: 'EXTREME_STRAIN',
    leftHand: { x: 300 + strainShake, y: 985 },
    rightHand: { x: 420 + strainShake, y: 985 },
    leftFoot: { x: 295, y: 1015 },
    rightFoot: { x: 425, y: 1015 },
    sweatDrops: u,
    cameraZoom: 1.1,
  };
}

/**
 * Renders a singleStickmanChoreographyScene at a true 24 FPS skeletal animation into an MP4 file,
 * piping raw RGBA frames from @napi-rs/canvas directly into FFmpeg along with comedic sound effects.
 */
export async function renderAnimatedStickmanSceneToMp4Async(params: {
  scene: StickmanChoreographyScene;
  outputMp4Path: string;
  voiceMp3Path?: string;
  fps?: number;
}): Promise<void> {
  const W = 720;
  const H = 1280;
  const fps = params.fps || 24;
  const durationSec = Math.max(4, Math.min(18, Number(params.scene.durationSec) || 10));
  const totalFrames = Math.round(durationSec * fps);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Build comedic procedural sound effect filter (footsteps, effort grunts, thud, ding lightbulb, door creak)
  const act = params.scene.actionType;
  let sfxExpr = `0.08*sin(2*PI*(180+60*sin(2*PI*3*t))*t)*exp(-2*mod(t,0.5))`;
  if (act === 'WALK_CONFIDENT' || act === 'PUSH_OPEN_AND_EXIT') {
    // Crisp footsteps + door creak
    sfxExpr = `0.12*sin(2*PI*140*t)*exp(-14*mod(t,0.42))`;
  } else if (act === 'THINK_LIGHTBULB_IDEA') {
    // Bright cartoon "DING!" bell when lightbulb turns on
    sfxExpr = `0.15*sin(2*PI*1046*t)*exp(-3.5*max(0,t-1.5))*gte(t,1.5)`;
  } else if (act === 'BRACE_FOOT_AND_FALL' || act === 'FLYING_KICK_BOUNCE') {
    // Strain rumble + comic impact thud
    sfxExpr = `0.14*sin(2*PI*(110+45*sin(18*t))*t)*exp(-3*mod(t,0.65))`;
  }

  const hasVoice =
    params.voiceMp3Path &&
    fs.existsSync(params.voiceMp3Path) &&
    fs.statSync(params.voiceMp3Path).size > 500;

  const ffArgs: string[] = [
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${W}x${H}`,
    '-r',
    String(fps),
    '-i',
    'pipe:0',
  ];

  if (hasVoice) {
    ffArgs.push(
      '-i',
      params.voiceMp3Path!,
      '-f',
      'lavfi',
      '-i',
      `aevalsrc='${sfxExpr}':s=44100:d=${durationSec}`,
      '-filter_complex',
      `[1:a]volume=1.35,apad=whole_dur=${durationSec}[v];[2:a]volume=0.55[sfx];[v][sfx]amix=inputs=2:duration=first[a]`,
      '-map',
      '0:v:0',
      '-map',
      '[a]'
    );
  } else {
    ffArgs.push(
      '-f',
      'lavfi',
      '-i',
      `aevalsrc='${sfxExpr}':s=44100:d=${durationSec}`,
      '-map',
      '0:v:0',
      '-map',
      '1:a:0'
    );
  }

  ffArgs.push(
    '-t',
    String(durationSec),
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-b:a',
    '128k',
    params.outputMp4Path
  );

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg stickman scene encode exited ${code}: ${stderr.slice(-300)}`));
    });

    let frameIdx = 0;
    const writeNextFrame = () => {
      while (frameIdx < totalFrames) {
        const u = frameIdx / Math.max(1, totalFrames - 1);
        const timeSec = frameIdx / fps;
        const pose = evaluateStickmanScenePose(params.scene.actionType, u, timeSec);

        ctx.save();
        if (pose.cameraZoom && pose.cameraZoom !== 1) {
          ctx.translate(W / 2, H / 2);
          ctx.scale(pose.cameraZoom, pose.cameraZoom);
          ctx.translate(-W / 2 + pose.cameraPanX, -H / 2 + pose.cameraPanY);
        }
        drawRoomAndDoor(ctx, W, H, pose, params.scene.propType);
        drawStickmanCharacter(ctx, pose);
        ctx.restore();

        const rawRgba = canvas.data();
        frameIdx++;
        const canContinue = proc.stdin!.write(rawRgba);
        if (!canContinue) {
          proc.stdin!.once('drain', writeNextFrame);
          return;
        }
      }
      proc.stdin!.end();
    };

    writeNextFrame();
  });
}
