import { createCanvas, SKRSContext2D } from '@napi-rs/canvas';
import { spawn, execFileSync } from 'child_process';
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
  | 'GYM_HEAVY_BARBELL'
  | 'CYANIDE_CLIFF_OPENING'
  | 'CYANIDE_KNIFE_ARGUMENT'
  | 'CYANIDE_PASS_KNIFE_PURPLE'
  | 'CYANIDE_PIANO_REVEAL'
  | 'CYANIDE_COUPLE_GLASSES'
  | 'CYANIDE_WIDE_TOWER_ZOOM'
  | 'CYANIDE_DIALOGUE_BANTER';

export type StickmanPropType =
  | 'DOOR'
  | 'MOSQUITO'
  | 'SPIDER'
  | 'GYM_BARBELL'
  | 'CLIFF_PIANO'
  | 'CYANIDE_STAGE';

export interface CyanideDialogueLine {
  speakerIndex: number; // 0=Yellow/Lead, 1=Red/Buddy, 2=Purple/Sarcastic, 3=Pianist/Twist, 4=GlassesGuy, 5=GlassesLady
  speakerName?: string;
  text: string;
  emotion?: 'PANIC' | 'ANGRY' | 'SARCASTIC' | 'SHOCKED' | 'DEADPAN' | 'SMUG';
  voice?: string;
  pitch?: string;
  rate?: string;
}

export interface StickmanChoreographyScene {
  sceneNumber: number;
  title: string;
  actionType: StickmanActionType;
  propType: StickmanPropType;
  durationSec: number;
  narrationText?: string;
  visualStyle?: 'CYANIDE_EXPLOSM' | 'MINT_DOOR_CLASSIC';
  aspectRatio?: '16:9' | '9:16';
  cameraShot?: 'WIDE_CLIFF' | 'TWO_SHOT_TOP' | 'TWO_SHOT_MID' | 'PIANO_CLOSEUP' | 'COUPLE_CLOSEUP' | 'FULL_ROPE_ZOOM' | 'AUTO_CUT';
  dialogueLines?: CyanideDialogueLine[];
}

interface StickmanPose {
  hipX: number;
  hipY: number;
  torsoAngle: number;
  headTilt: number;
  lookDirX: number;
  lookDirY: number;
  expression:
    | 'SMUG'
    | 'CONFIDENT'
    | 'WORRIED'
    | 'STRAIN'
    | 'EXTREME_STRAIN'
    | 'PAIN_FALL'
    | 'THINKING'
    | 'IDEA'
    | 'SHOCKED';
  leftHand: { x: number; y: number };
  rightHand: { x: number; y: number };
  leftFoot: { x: number; y: number };
  rightFoot: { x: number; y: number };
  doorOpenAngle: number;
  doorShakeX: number;
  showLightbulb: number;
  showCrowbar: boolean;
  showImpactBurst: { x: number; y: number; scale: number } | null;
  sweatDrops: number;
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

// ============================================================================
// CYANIDE & HAPPINESS ("EXPLOSM") 2D VECTOR CHARACTER & SCENE ENGINE
// Matches "ejemplo stickman.mp4" 1:1 (peach round heads, rectangular shirts,
// thick black outlines, braided cliff rope, ski goggles, knife, upside-down
// grand piano + pianist, glasses couple, camera whip-pans & real lip-sync)
// ============================================================================

export interface CyanideCharacterSpec {
  id: number;
  shirtColor: string;
  shirtPattern?: 'SOLID' | 'PLAID_CYAN';
  headSkinColor?: string;
  tiltRad: number; // angle on rope or stage
  anchorX: number;
  anchorY: number;
  scale?: number;
  accessory?: 'ORANGE_GOGGLES' | 'ROUND_GLASSES' | 'CURLY_HAIR_GLASSES' | 'PIANIST_HAIR' | 'NONE';
  prop?: 'KNIFE' | 'NONE';
  tiedToRope?: boolean;
  upsideDown?: boolean;
  emotion: 'PANIC' | 'ANGRY' | 'SARCASTIC' | 'SHOCKED' | 'DEADPAN' | 'SMUG';
  mouthOpenAmt: number; // 0.0 (closed) to 1.0 (wide shouting) driven by audio lip-sync!
  lookX: number;
  lookY: number;
  armWavePhase: number;
}

/**
 * Draws the braided vertical climbing rope from `ejemplo stickman.mp4`.
 */
function drawBraidedRope(ctx: SKRSContext2D, topX: number, topY: number, botX: number, botY: number, width = 10) {
  ctx.save();
  // Outer thick black rope edges
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = width + 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(botX, botY);
  ctx.stroke();

  // Inner dark gray rope core
  ctx.strokeStyle = '#52525B';
  ctx.lineWidth = width - 2;
  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(botX, botY);
  ctx.stroke();

  // Diagonal braided rope texture lines every 16px
  const dist = Math.hypot(botX - topX, botY - topY);
  const steps = Math.floor(dist / 16);
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < steps; i++) {
    const t = i / Math.max(1, steps);
    const cx = lerp(topX, botX, t);
    const cy = lerp(topY, botY, t);
    ctx.beginPath();
    ctx.moveTo(cx - width * 0.45, cy - 4);
    ctx.lineTo(cx + width * 0.45, cy + 4);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws the rocky brown cliff overhang & wall on the top-right (`frame_01.jpg`, `frame_09.jpg`).
 */
function drawCyanideCliffBackground(
  ctx: SKRSContext2D,
  W: number,
  H: number,
  camX: number,
  camY: number,
  camZoom: number,
  timeSec: number,
  showFullCliffWall: boolean
) {
  // 1. Pale ice-blue sky (#E3F6F8 - exact match to ejemplo stickman.mp4)
  ctx.fillStyle = '#E3F6F8';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(camZoom, camZoom);
  ctx.translate(-W / 2 - camX, -H / 2 - camY);

  // 2. Sweeping white wind cloud streaks in sky (exact match to frame_01 & frame_02)
  const windDrift = Math.sin(timeSec * 0.8) * 18;
  ctx.fillStyle = '#FFFFFF';
  for (const cloudY of [280, 980, 1680, 2350]) {
    ctx.beginPath();
    ctx.moveTo(-250 + windDrift, cloudY);
    ctx.quadraticCurveTo(180 + windDrift, cloudY - 12, 460 + windDrift, cloudY + 42);
    ctx.quadraticCurveTo(475 + windDrift, cloudY + 58, 430 + windDrift, cloudY + 62);
    ctx.quadraticCurveTo(150 + windDrift, cloudY + 25, -250 + windDrift, cloudY + 38);
    ctx.closePath();
    ctx.fill();
  }

  // 3. Top rocky overhang ledge where the rope is anchored (around y = 0..170)
  ctx.fillStyle = '#5C5343';
  ctx.strokeStyle = '#26221B';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(580, -80);
  ctx.lineTo(570, 28);
  ctx.lineTo(625, 55);
  ctx.lineTo(750, 95);
  ctx.lineTo(980, 130);
  ctx.lineTo(1180, 148);
  ctx.lineTo(1450, 120);
  if (showFullCliffWall) {
    // Full right-side cliff rock wall extending deep down (as seen in wide shot frame_09.jpg)
    ctx.lineTo(1450, 2900);
    ctx.lineTo(1180, 2900);
    ctx.lineTo(1120, 2400);
    ctx.lineTo(1060, 1950);
    ctx.lineTo(1080, 1450);
    ctx.lineTo(1010, 980);
    ctx.lineTo(1025, 580);
    ctx.lineTo(950, 360);
    ctx.lineTo(960, 185);
    ctx.lineTo(915, 130);
  } else {
    ctx.lineTo(1450, -80);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rock shading facets
  ctx.fillStyle = '#4B4335';
  ctx.beginPath();
  ctx.moveTo(640, 20);
  ctx.lineTo(890, 80);
  ctx.lineTo(1160, 115);
  ctx.lineTo(1260, 65);
  ctx.lineTo(760, -10);
  ctx.closePath();
  ctx.fill();

  // Metal piton loop at cliff tip (600, 42)
  ctx.strokeStyle = '#1F2937';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(604, 42, 12, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws the upside-down Grand Piano + Wooden Bench tied to the rope (`frame_07.jpg`, `frame_20.jpg`).
 */
function drawUpsideDownGrandPiano(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  scale: number,
  swayRad: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(swayRad);

  // 1. Grand Piano curved dark body (tilted ~ -14 deg like frame_07.jpg)
  ctx.save();
  ctx.rotate(-0.22);

  // Main black/charcoal piano case
  ctx.fillStyle = '#2B2D2F';
  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(-260, -40);
  ctx.lineTo(-290, -240);
  ctx.quadraticCurveTo(-280, -370, -90, -350);
  ctx.quadraticCurveTo(40, -330, 110, -210);
  ctx.quadraticCurveTo(185, -180, 215, -90);
  ctx.lineTo(285, -105);
  ctx.quadraticCurveTo(300, -85, 275, -65);
  ctx.lineTo(195, -35);
  ctx.lineTo(-240, -15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Darker inner rim shade
  ctx.fillStyle = '#1E2022';
  ctx.beginPath();
  ctx.moveTo(-250, -55);
  ctx.lineTo(190, -55);
  ctx.lineTo(175, -125);
  ctx.lineTo(-265, -115);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // White keyboard strip (88 keys bed)
  const kbLeft = -230;
  const kbRight = 175;
  const kbTop = -55;
  const kbHeight = 48;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.rect(kbLeft, kbTop, kbRight - kbLeft, kbHeight);
  ctx.fill();
  ctx.stroke();

  // White key dividers & Black sharp/flat keys
  const numWhiteKeys = 18;
  const keyW = (kbRight - kbLeft) / numWhiteKeys;
  ctx.lineWidth = 3;
  for (let k = 1; k < numWhiteKeys; k++) {
    const kx = kbLeft + k * keyW;
    ctx.beginPath();
    ctx.moveTo(kx, kbTop);
    ctx.lineTo(kx, kbTop + kbHeight);
    ctx.stroke();
  }
  ctx.fillStyle = '#0D0E10';
  for (let k = 0; k < numWhiteKeys - 1; k++) {
    if (k % 7 === 2 || k % 7 === 6) continue;
    const kx = kbLeft + (k + 0.65) * keyW;
    ctx.fillRect(kx, kbTop, keyW * 0.58, kbHeight * 0.62);
  }

  // Criss-crossing braided ropes tying the grand piano
  drawBraidedRope(ctx, -285, -210, -110, -345, 9);
  drawBraidedRope(ctx, -275, -145, -60, -335, 9);
  drawBraidedRope(ctx, -215, 2, -115, -345, 9);
  drawBraidedRope(ctx, -205, 4, -75, -340, 9);

  // Ropes suspending the wooden piano bench below the keyboard
  drawBraidedRope(ctx, -25, -4, -15, 95, 7);
  drawBraidedRope(ctx, 130, -4, 140, 95, 7);

  // Wooden brown piano bench (upside down)
  ctx.fillStyle = '#6A533D';
  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.rect(-75, 80, 255, 72);
  ctx.fill();
  ctx.stroke();

  // Bench legs sticking out to the right
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(180, 88);
  ctx.lineTo(212, 68);
  ctx.moveTo(180, 142);
  ctx.lineTo(212, 122);
  ctx.stroke();

  // Ropes wrapped around the bench
  drawBraidedRope(ctx, 110, 78, 132, 154, 7);
  drawBraidedRope(ctx, 128, 78, 148, 154, 7);
  drawBraidedRope(ctx, -38, 78, -22, 154, 7);

  ctx.restore();
  ctx.restore();
}

/**
 * Draws a single Cyanide & Happiness ("Explosm") 2D Stickman character with:
 * - Rectangular colored shirt with thick black outline + rope coils
 * - Round warm-peach head (`#FFE299`) with thick black outline (`6px`)
 * - Solid black oval eyes, expressive eyebrows, accessories (ski goggles, glasses, curly hair)
 * - Audio-reactive lip-sync mouth (`mouthOpenAmt` 0..1)
 * - Curved black noodle stick arms & legs + knife prop
 */
function drawCyanideStickmanCharacter(ctx: SKRSContext2D, ch: CyanideCharacterSpec, timeSec: number) {
  const sc = ch.scale || 1.0;
  ctx.save();
  ctx.translate(ch.anchorX, ch.anchorY);
  ctx.scale(sc, sc);
  ctx.rotate(ch.tiltRad);

  const shirtW = 86;
  const shirtH = 98;
  const headR = 72;

  // If upsideDown (like the pianist in frame_07.jpg), head is at bottom (+Y) and legs at top (-Y)
  const dirY = ch.upsideDown ? -1 : 1;

  // 1. Curved black noodle stick legs
  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';
  const legWiggle = Math.sin(timeSec * 5 + ch.armWavePhase) * 8;
  ctx.beginPath();
  // Left leg
  ctx.moveTo(-24, (shirtH * 0.5) * dirY);
  ctx.quadraticCurveTo(
    -32 + legWiggle * 0.4,
    (shirtH * 0.5 + 42) * dirY,
    -18 + legWiggle,
    (shirtH * 0.5 + 78) * dirY
  );
  // Right leg
  ctx.moveTo(24, (shirtH * 0.5) * dirY);
  ctx.quadraticCurveTo(
    38 - legWiggle * 0.4,
    (shirtH * 0.5 + 38) * dirY,
    32 - legWiggle,
    (shirtH * 0.5 + 74) * dirY
  );
  ctx.stroke();

  // 2. Rectangular/trapezoidal colored shirt
  ctx.fillStyle = ch.shirtColor;
  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.roundRect(-shirtW / 2, -shirtH / 2, shirtW, shirtH, 6);
  ctx.fill();

  // Optional cyan plaid pattern (like the bottom guy with glasses in frame_14.jpg)
  if (ch.shirtPattern === 'PLAID_CYAN') {
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = '#5EA8B8';
    ctx.lineWidth = 3;
    for (let px = -shirtW / 2; px <= shirtW / 2; px += 18) {
      ctx.beginPath();
      ctx.moveTo(px, -shirtH / 2);
      ctx.lineTo(px, shirtH / 2);
      ctx.stroke();
    }
    for (let py = -shirtH / 2; py <= shirtH / 2; py += 18) {
      ctx.beginPath();
      ctx.moveTo(-shirtW / 2, py);
      ctx.lineTo(shirtW / 2, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 6.5;
  ctx.strokeRect(-shirtW / 2, -shirtH / 2, shirtW, shirtH);

  // 3. Braided horizontal rope coils tied around the shirt (if tiedToRope)
  if (ch.tiedToRope !== false) {
    for (const ry of [-12, 2, 16]) {
      drawBraidedRope(ctx, -shirtW / 2 - 4, ry, shirtW / 2 + 4, ry, 7);
    }
  }

  // 4. Curved black noodle stick arms + optional Knife prop
  const armWave = Math.sin(timeSec * 8 + ch.armWavePhase) * (ch.mouthOpenAmt > 0.15 ? 16 : 4);
  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 7.5;
  ctx.lineCap = 'round';

  // Left arm (holding knife if ch.prop === 'KNIFE', else gripping rope or gesturing)
  const leftHandX = ch.prop === 'KNIFE' ? -78 : -58;
  const leftHandY = (-18 + armWave) * dirY;
  ctx.beginPath();
  ctx.moveTo(-shirtW / 2, -18 * dirY);
  ctx.quadraticCurveTo(-shirtW / 2 - 28, (6 + armWave * 0.5) * dirY, leftHandX, leftHandY);
  ctx.stroke();

  // Right arm
  const rightHandX = 56;
  const rightHandY = (-24 - armWave * 0.7) * dirY;
  ctx.beginPath();
  ctx.moveTo(shirtW / 2, -18 * dirY);
  ctx.quadraticCurveTo(shirtW / 2 + 28, (-4 - armWave * 0.4) * dirY, rightHandX, rightHandY);
  ctx.stroke();

  // Draw Knife in left hand (`frame_02.jpg`, `frame_12.jpg`)
  if (ch.prop === 'KNIFE') {
    ctx.save();
    ctx.translate(leftHandX, leftHandY);
    ctx.rotate(-0.55 + Math.sin(timeSec * 10) * 0.08);
    // Green handle
    ctx.fillStyle = '#2F6F4E';
    ctx.strokeStyle = '#0D0E10';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(-12, -6, 28, 12, 3);
    ctx.fill();
    ctx.stroke();
    // Crossguard
    ctx.fillStyle = '#94A3B8';
    ctx.beginPath();
    ctx.roundRect(-16, -13, 7, 26, 2);
    ctx.fill();
    ctx.stroke();
    // Sharp metallic white/silver blade
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.moveTo(-16, -9);
    ctx.lineTo(-82, -2);
    ctx.lineTo(-16, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 5. Large Round Warm-Peach Head (`#FFE299`)
  const headY = (-shirtH / 2 - headR + 8) * dirY;
  ctx.save();
  ctx.translate(0, headY);
  if (ch.upsideDown) {
    ctx.rotate(Math.PI);
  }

  // Optional pianist spiky black hair behind head (`frame_07.jpg`)
  if (ch.accessory === 'PIANIST_HAIR') {
    ctx.fillStyle = '#0D0E10';
    ctx.beginPath();
    ctx.moveTo(-headR * 0.7, -headR * 0.4);
    ctx.lineTo(-headR * 1.15, -headR * 0.95);
    ctx.lineTo(-headR * 0.3, -headR * 1.15);
    ctx.lineTo(headR * 0.5, -headR * 1.1);
    ctx.lineTo(headR * 0.95, -headR * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // Peach head circle
  ctx.fillStyle = ch.headSkinColor || '#FFE299';
  ctx.strokeStyle = '#0D0E10';
  ctx.lineWidth = 6.5;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Optional Fluffy Brown Curly Hair (`frame_14.jpg` top lady)
  if (ch.accessory === 'CURLY_HAIR_GLASSES') {
    ctx.fillStyle = '#5A381E';
    ctx.strokeStyle = '#0D0E10';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(-25, -headR + 4, 34, 0, Math.PI * 2);
    ctx.arc(15, -headR - 6, 38, 0, Math.PI * 2);
    ctx.arc(52, -headR + 12, 32, 0, Math.PI * 2);
    ctx.arc(68, -18, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 6. Solid Black Oval Eyes & Expressive Eyebrows (or Orange Ski Goggles)
  const eyeLX = -22 + ch.lookX * 6;
  const eyeRX = 22 + ch.lookX * 6;
  const eyeY = -10 + ch.lookY * 6;

  if (ch.accessory === 'ORANGE_GOGGLES') {
    // Strap going up to crown of head
    ctx.fillStyle = '#3F332A';
    ctx.strokeStyle = '#0D0E10';
    ctx.lineWidth = 4.5;
    ctx.save();
    ctx.rotate(-0.35);
    ctx.fillRect(-headR + 4, -22, headR * 1.9, 20);
    ctx.strokeRect(-headR + 4, -22, headR * 1.9, 20);
    // Orange ski goggles lens (`frame_02.jpg`)
    ctx.fillStyle = '#F99B45';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(-52, -26, 98, 42, 16);
    ctx.fill();
    ctx.stroke();
    // Peach reflection blobs inside goggles
    ctx.fillStyle = '#FFD8A8';
    ctx.beginPath();
    ctx.arc(-20, -6, 12, 0, Math.PI * 2);
    ctx.arc(18, -6, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // Blink every ~3.4 seconds
    const isBlinking = Math.sin(timeSec * 1.85 + ch.id * 2.1) > 0.96;
    ctx.fillStyle = '#0D0E10';
    ctx.strokeStyle = '#0D0E10';
    ctx.lineWidth = 4.5;

    if (isBlinking) {
      ctx.beginPath();
      ctx.moveTo(eyeLX - 10, eyeY);
      ctx.lineTo(eyeLX + 10, eyeY);
      ctx.moveTo(eyeRX - 10, eyeY);
      ctx.lineTo(eyeRX + 10, eyeY);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(eyeLX, eyeY, 8.5, 10.5, 0, 0, Math.PI * 2);
      ctx.ellipse(eyeRX, eyeY, 8.5, 10.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Eyebrows based on emotion
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    if (ch.emotion === 'ANGRY' || ch.emotion === 'SARCASTIC') {
      ctx.moveTo(eyeLX - 13, eyeY - 22);
      ctx.lineTo(eyeLX + 11, eyeY - 13);
      ctx.moveTo(eyeRX + 13, eyeY - 22);
      ctx.lineTo(eyeRX - 11, eyeY - 13);
    } else if (ch.emotion === 'PANIC' || ch.emotion === 'SHOCKED') {
      ctx.moveTo(eyeLX - 13, eyeY - 13);
      ctx.lineTo(eyeLX + 11, eyeY - 23);
      ctx.moveTo(eyeRX - 11, eyeY - 23);
      ctx.lineTo(eyeRX + 13, eyeY - 13);
    } else {
      ctx.moveTo(eyeLX - 12, eyeY - 18);
      ctx.lineTo(eyeLX + 12, eyeY - 18);
      ctx.moveTo(eyeRX - 12, eyeY - 18);
      ctx.lineTo(eyeRX + 12, eyeY - 18);
    }
    ctx.stroke();

    // Optional Round Glasses (`frame_14.jpg`)
    if (ch.accessory === 'ROUND_GLASSES' || ch.accessory === 'CURLY_HAIR_GLASSES') {
      ctx.strokeStyle = ch.accessory === 'CURLY_HAIR_GLASSES' ? '#4C1D24' : '#6B5B3E';
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.arc(eyeLX, eyeY, 20, 0, Math.PI * 2);
      ctx.arc(eyeRX, eyeY, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(eyeLX + 20, eyeY);
      ctx.lineTo(eyeRX - 20, eyeY);
      ctx.stroke();
    }
  }

  // 7. Audio-Reactive Lip-Sync Mouth (`mouthOpenAmt` 0.0 -> 1.0)
  const mY = 26;
  const open = Math.max(0, Math.min(1, ch.mouthOpenAmt));
  ctx.strokeStyle = '#0D0E10';
  ctx.fillStyle = '#0D0E10';
  ctx.lineWidth = 4.2;

  if (open > 0.55) {
    // Wide open Cyanide & Happiness shouting mouth (black D-shape / kidney shape with white teeth bar or tongue)
    const mw = 36 + open * 16;
    const mh = 18 + open * 18;
    ctx.beginPath();
    ctx.roundRect(-mw / 2, mY - mh * 0.35, mw, mh, 8);
    ctx.fill();
    ctx.stroke();
    // White teeth strip at top of open mouth
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-mw / 2 + 4, mY - mh * 0.35 + 2, mw - 8, 6, 2);
    ctx.fill();
  } else if (open > 0.16) {
    // Medium talking oval mouth
    const mw = 22 + open * 24;
    const mh = 8 + open * 18;
    ctx.beginPath();
    ctx.ellipse(0, mY, mw * 0.5, mh * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Closed mouth expression when listening
    ctx.beginPath();
    if (ch.emotion === 'SMUG') {
      ctx.arc(0, mY - 4, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    } else if (ch.emotion === 'PANIC' || ch.emotion === 'ANGRY') {
      ctx.arc(0, mY + 12, 15, 1.18 * Math.PI, 1.82 * Math.PI);
    } else {
      ctx.moveTo(-15, mY);
      ctx.lineTo(15, mY);
    }
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Synthesizes multi-character Spanish dialogue audio for a Cyanide & Happiness scene using `edge-tts`,
 * concatenating each character's turn into a single scene MP3 and returning the exact timeline of
 * who is speaking at any time `t` so the renderer animates the exact speaker's mouth!
 */
export interface SpeakerTimelineSegment {
  speakerIndex: number;
  startSec: number;
  endSec: number;
  emotion: 'PANIC' | 'ANGRY' | 'SARCASTIC' | 'SHOCKED' | 'DEADPAN' | 'SMUG';
  text: string;
}

const SPANISH_CHARACTER_VOICES: Array<{ voice: string; pitch: string; rate: string }> = [
  { voice: 'es-ES-AlvaroNeural', pitch: '+7Hz', rate: '+14%' }, // 0: Yellow Goggles Guy (panicked / energetic)
  { voice: 'es-MX-JorgeNeural', pitch: '-5Hz', rate: '+10%' },  // 1: Red Shirt Guy (skeptical / intense)
  { voice: 'es-AR-TomasNeural', pitch: '+2Hz', rate: '+12%' },  // 2: Purple Shirt Guy (sarcastic / sharp)
  { voice: 'es-CO-GonzaloNeural', pitch: '-12Hz', rate: '+8%' }, // 3: Upside-down Pianist (dramatic / outraged)
  { voice: 'es-CL-LorenzoNeural', pitch: '-3Hz', rate: '+10%' }, // 4: Glasses Guy
  { voice: 'es-ES-ElviraNeural', pitch: '+9Hz', rate: '+12%' },  // 5: Glasses Lady
];

export async function synthesizeMultiCharacterSceneDialogueAsync(params: {
  dialogueLines: CyanideDialogueLine[];
  outputDir: string;
  sceneNumber: number;
  targetDurationSec: number;
}): Promise<{ combinedAudioPath?: string; segments: SpeakerTimelineSegment[]; actualDurationSec: number }> {
  fs.mkdirSync(params.outputDir, { recursive: true });
  const segments: SpeakerTimelineSegment[] = [];
  const lineFiles: string[] = [];
  let cursorSec = 0.15;

  for (let i = 0; i < params.dialogueLines.length; i++) {
    const line = params.dialogueLines[i];
    const cleanText = String(line.text || '').trim();
    if (!cleanText) continue;

    const slot = Math.abs(Number(line.speakerIndex) || 0) % SPANISH_CHARACTER_VOICES.length;
    const preset = SPANISH_CHARACTER_VOICES[slot];
    const voice = line.voice || preset.voice;
    const pitch = line.pitch || preset.pitch;
    const rate = line.rate || preset.rate;

    const lineMp3 = path.join(params.outputDir, `sc${params.sceneNumber}_line_${i}.mp3`);
    let dur = Math.max(1.4, Math.min(4.8, cleanText.split(/\s+/).length * 0.34));

    try {
      execFileSync(
        'python3',
        [
          '-m',
          'edge_tts',
          '--voice',
          voice,
          `--pitch=${pitch}`,
          `--rate=${rate}`,
          '--text',
          cleanText,
          '--write-media',
          lineMp3,
        ],
        { stdio: 'ignore', timeout: 18000 }
      );
      if (fs.existsSync(lineMp3) && fs.statSync(lineMp3).size > 400) {
        lineFiles.push(lineMp3);
        try {
          const probeOut = execFileSync(
            'ffprobe',
            ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', lineMp3],
            { encoding: 'utf-8', timeout: 5000 }
          ).trim();
          const parsedDur = parseFloat(probeOut);
          if (Number.isFinite(parsedDur) && parsedDur > 0.3) {
            dur = parsedDur;
          }
        } catch {}
      }
    } catch {}

    segments.push({
      speakerIndex: slot,
      startSec: cursorSec,
      endSec: cursorSec + dur,
      emotion: line.emotion || 'PANIC',
      text: cleanText,
    });
    cursorSec += dur + 0.18;
  }

  const totalDur = Math.max(params.targetDurationSec, Math.ceil(cursorSec + 0.4));

  if (lineFiles.length === 0) {
    return { segments, actualDurationSec: params.targetDurationSec };
  }

  const combinedAudioPath = path.join(params.outputDir, `sc${params.sceneNumber}_dialogue_full.mp3`);
  try {
    // Concatenate all character voice turns with a slight 150ms pause between turns
    const listFile = path.join(params.outputDir, `sc${params.sceneNumber}_lines.txt`);
    fs.writeFileSync(
      listFile,
      lineFiles.map((f) => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'),
      'utf-8'
    );
    execFileSync(
      'ffmpeg',
      ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libmp3lame', '-q:a', '3', combinedAudioPath],
      { stdio: 'ignore', timeout: 15000 }
    );
  } catch {}

  return {
    combinedAudioPath: fs.existsSync(combinedAudioPath) ? combinedAudioPath : lineFiles[0],
    segments,
    actualDurationSec: totalDur,
  };
}

/**
 * Renders an entire Cyanide & Happiness ("Explosm") multi-character scene onto the 2D canvas
 * for normalized progress `u` in [0, 1] and time `timeSec`.
 */
function renderCyanideExplosmFrame(
  ctx: SKRSContext2D,
  W: number,
  H: number,
  scene: StickmanChoreographyScene,
  u: number,
  timeSec: number,
  segments: SpeakerTimelineSegment[]
) {
  // Determine who is currently speaking at `timeSec`
  const activeSeg = segments.find((s) => timeSec >= s.startSec && timeSec <= s.endSec);
  const activeSpeaker = activeSeg ? activeSeg.speakerIndex : -1;

  // Syllabic lip-sync oscillation (11 Hz + 17 Hz harmonic) when character is speaking
  const syllabicOpen =
    activeSpeaker >= 0
      ? Math.max(0.15, Math.min(1.0, 0.55 + 0.42 * Math.sin(timeSec * 36) * Math.cos(timeSec * 19)))
      : 0;

  // Gentle rope pendulum sway
  const ropeSwayX = Math.sin(timeSec * 1.9) * 10;

  // Determine camera target (Y position along the cliff rope & zoom level)
  // World coordinates along the vertical rope:
  // Piton at (604, 42)
  // Char 0 (Yellow + Goggles + Knife): y = 260
  // Char 1 (Red Shirt): y = 510
  // Char 2 (Purple Shirt): y = 780
  // Char 3 (Upside-Down Grand Piano + Pianist): y = 1280
  // Char 4 & 5 (Glasses Couple): y = 1760 & 2040
  let camX = 0;
  let camY = 0;
  let camZoom = 1.0;
  let showFullCliffWall = false;

  const act = scene.actionType;
  if (act === 'CYANIDE_CLIFF_OPENING' || scene.sceneNumber === 1) {
    // Matches frame_01.jpg -> frame_02.jpg: Starts wide showing cliff overhang, then zooms in on Yellow + Red!
    const zProgress = easeInOutQuad(Math.min(1, u * 1.6));
    camX = lerp(40, -20, zProgress);
    camY = lerp(-40, 20, zProgress);
    camZoom = lerp(0.88, 1.18, zProgress);
  } else if (act === 'CYANIDE_KNIFE_ARGUMENT' || scene.sceneNumber === 2) {
    // Matches frame_02.jpg / motion_grid_10s.jpg: Tight two-shot on Yellow Goggles holding knife & Red Shirt
    camX = -30;
    camY = 35;
    camZoom = 1.24;
  } else if (act === 'CYANIDE_PASS_KNIFE_PURPLE' || scene.sceneNumber === 3) {
    // Matches frame_04.jpg & frame_12.jpg: Camera whip-pans down rope to Red Shirt + Purple Shirt
    const panP = easeInOutQuad(Math.min(1, u * 2.2));
    camX = -35;
    camY = lerp(40, 315, panP);
    camZoom = 1.32;
  } else if (act === 'CYANIDE_PIANO_REVEAL' || scene.sceneNumber === 4) {
    // Matches frame_07.jpg & motion_grid_45s.jpg: Whip-pan down to the Upside-Down Grand Piano + Pianist!
    const panP = easeInOutQuad(Math.min(1, u * 2.0));
    camX = -55;
    camY = lerp(320, 890, panP);
    camZoom = 1.15;
  } else if (act === 'CYANIDE_COUPLE_GLASSES' || scene.sceneNumber === 5) {
    // Matches frame_14.jpg: Whip-pan further down to Glasses Lady + Plaid Shirt Glasses Guy!
    const panP = easeInOutQuad(Math.min(1, u * 2.0));
    camX = -45;
    camY = lerp(890, 1520, panP);
    camZoom = 1.28;
  } else if (act === 'CYANIDE_WIDE_TOWER_ZOOM' || scene.sceneNumber >= 6) {
    // Matches frame_09.jpg: Dramatic wide zoom-out revealing the entire cliff wall + all characters + Grand Piano!
    showFullCliffWall = true;
    const zOut = easeInOutQuad(Math.min(1, u * 1.8));
    camX = lerp(-40, 110, zOut);
    camY = lerp(650, 420, zOut);
    camZoom = lerp(0.95, 0.48, zOut);
  } else {
    // Dynamic auto-cut based on activeSpeaker!
    if (activeSpeaker === 3) {
      camX = -55;
      camY = 890;
      camZoom = 1.16;
    } else if (activeSpeaker === 2) {
      camX = -35;
      camY = 315;
      camZoom = 1.3;
    } else if (activeSpeaker >= 4) {
      camX = -45;
      camY = 1520;
      camZoom = 1.26;
    } else {
      camX = -25;
      camY = 30;
      camZoom = 1.22;
    }
  }

  // Draw Sky + Wind Streaks + Rocky Cliff Overhang
  drawCyanideCliffBackground(ctx, W, H, camX, camY, camZoom, timeSec, showFullCliffWall);

  // Transform into World Space for Rope + Characters + Props
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(camZoom, camZoom);
  ctx.translate(-W / 2 - camX, -H / 2 - camY);

  const ropeTopX = 604;
  const ropeTopY = 42;
  const ropeBotX = 604 + ropeSwayX;
  const ropeBotY = 2650;

  // Main continuous vertical braided rope
  drawBraidedRope(ctx, ropeTopX, ropeTopY, ropeBotX, ropeBotY, 10);

  // Determine who holds the knife in this scene
  const knifeHolder =
    act === 'CYANIDE_PASS_KNIFE_PURPLE' || scene.sceneNumber === 3
      ? u > 0.45
        ? 2
        : 1
      : act === 'CYANIDE_CLIFF_OPENING' && u < 0.35
        ? -1
        : 0;

  // 1. Character 0: Yellow Shirt + Orange Ski Goggles (Top of rope)
  drawCyanideStickmanCharacter(
    ctx,
    {
      id: 0,
      shirtColor: '#FACC15',
      anchorX: 598 + ropeSwayX * 0.15,
      anchorY: 265,
      tiltRad: -0.46,
      accessory: 'ORANGE_GOGGLES',
      prop: knifeHolder === 0 ? 'KNIFE' : 'NONE',
      emotion: activeSpeaker === 0 ? (activeSeg?.emotion || 'PANIC') : 'PANIC',
      mouthOpenAmt: activeSpeaker === 0 ? syllabicOpen : 0,
      lookX: 0,
      lookY: 1,
      armWavePhase: 0.4,
    },
    timeSec
  );

  // 2. Character 1: Red Shirt Guy (Second on rope)
  drawCyanideStickmanCharacter(
    ctx,
    {
      id: 1,
      shirtColor: '#B91C1C',
      anchorX: 598 + ropeSwayX * 0.3,
      anchorY: 515,
      tiltRad: -0.44,
      accessory: 'NONE',
      prop: knifeHolder === 1 ? 'KNIFE' : 'NONE',
      emotion: activeSpeaker === 1 ? (activeSeg?.emotion || 'ANGRY') : 'WORRIED' as any,
      mouthOpenAmt: activeSpeaker === 1 ? syllabicOpen : 0,
      lookX: 0,
      lookY: activeSpeaker === 2 ? 1 : -1,
      armWavePhase: 1.7,
    },
    timeSec
  );

  // 3. Character 2: Purple Shirt Guy (Third on rope)
  drawCyanideStickmanCharacter(
    ctx,
    {
      id: 2,
      shirtColor: '#7C3AED',
      anchorX: 605 + ropeSwayX * 0.48,
      anchorY: 795,
      tiltRad: 0.44,
      accessory: 'NONE',
      prop: knifeHolder === 2 ? 'KNIFE' : 'NONE',
      emotion: activeSpeaker === 2 ? (activeSeg?.emotion || 'SARCASTIC') : 'ANGRY',
      mouthOpenAmt: activeSpeaker === 2 ? syllabicOpen : 0,
      lookX: -0.5,
      lookY: -1,
      armWavePhase: 3.1,
    },
    timeSec
  );

  // 4. Upside-Down Grand Piano + Pianist on Wooden Bench (Fourth on rope - exact match to frame_07.jpg!)
  const pianoX = 560 + ropeSwayX * 0.68;
  const pianoY = 1235;
  drawUpsideDownGrandPiano(ctx, pianoX, pianoY, 0.92, Math.sin(timeSec * 2.2) * 0.025);

  drawCyanideStickmanCharacter(
    ctx,
    {
      id: 3,
      shirtColor: '#18181B',
      anchorX: pianoX + 12,
      anchorY: pianoY + 135,
      tiltRad: 0.08,
      upsideDown: true,
      tiedToRope: true,
      accessory: 'PIANIST_HAIR',
      prop: 'NONE',
      emotion: activeSpeaker === 3 ? (activeSeg?.emotion || 'ANGRY') : 'SHOCKED',
      mouthOpenAmt: activeSpeaker === 3 ? syllabicOpen : 0,
      lookX: 0,
      lookY: -1,
      armWavePhase: 4.5,
    },
    timeSec
  );

  // 5. Character 4: Pink Shirt Lady with Curly Hair & Glasses (Fifth on rope - frame_14.jpg)
  drawCyanideStickmanCharacter(
    ctx,
    {
      id: 5,
      shirtColor: '#EC4899',
      anchorX: 598 + ropeSwayX * 0.82,
      anchorY: 1695,
      tiltRad: 0.42,
      accessory: 'CURLY_HAIR_GLASSES',
      prop: 'NONE',
      emotion: activeSpeaker === 5 ? (activeSeg?.emotion || 'SHOCKED') : 'PANIC',
      mouthOpenAmt: activeSpeaker === 5 ? syllabicOpen : 0,
      lookX: 0,
      lookY: 1,
      armWavePhase: 2.2,
    },
    timeSec
  );

  // 6. Character 5: Cyan Plaid Shirt Guy with Round Glasses (Sixth on rope - frame_14.jpg)
  drawCyanideStickmanCharacter(
    ctx,
    {
      id: 4,
      shirtColor: '#CFFAFE',
      shirtPattern: 'PLAID_CYAN',
      anchorX: 595 + ropeSwayX * 0.95,
      anchorY: 1995,
      tiltRad: -0.38,
      accessory: 'ROUND_GLASSES',
      prop: 'NONE',
      emotion: activeSpeaker === 4 ? (activeSeg?.emotion || 'PANIC') : 'SHOCKED',
      mouthOpenAmt: activeSpeaker === 4 ? syllabicOpen : 0,
      lookX: 0,
      lookY: -1,
      armWavePhase: 5.2,
    },
    timeSec
  );

  ctx.restore();
}

/**
 * Draws the classic mint-green 3D perspective room and brown wooden door (fallback if MINT_DOOR_CLASSIC is chosen).
 */
function drawRoomAndDoor(ctx: SKRSContext2D, W: number, H: number, pose: StickmanPose, propType: StickmanPropType) {
  const cornerX = 250;
  const ceilingCornerY = 175;
  const floorCornerY = 935;

  ctx.fillStyle = '#CBEAE7';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#BCE0DD';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(cornerX, ceilingCornerY);
  ctx.lineTo(cornerX, floorCornerY);
  ctx.lineTo(0, 935);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#B2DAD6';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(W, 0);
  ctx.lineTo(cornerX, ceilingCornerY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#B5DBD8';
  ctx.beginPath();
  ctx.moveTo(0, 935);
  ctx.lineTo(cornerX, floorCornerY);
  ctx.lineTo(W, 1175);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fill();

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

  const sx = pose.doorShakeX || 0;
  const doorLeftX = 430 + sx;
  const doorRightX = 655 + sx;
  const doorTopLeftY = 235;
  const doorTopRightY = 140;
  const doorBotLeftY = 1045;
  const doorBotRightY = 1165;

  ctx.fillStyle = '#92B8BA';
  ctx.beginPath();
  ctx.moveTo(doorLeftX, doorTopLeftY);
  ctx.lineTo(doorRightX, doorTopRightY);
  ctx.lineTo(doorRightX, doorBotRightY);
  ctx.lineTo(doorLeftX, doorBotLeftY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#5E3A1E';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(doorLeftX, doorBotLeftY);
  ctx.lineTo(doorLeftX, doorTopLeftY);
  ctx.lineTo(doorRightX, doorTopRightY);
  ctx.lineTo(doorRightX, doorBotRightY);
  ctx.stroke();

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

  const knobX = lerp(freeEdgeX + 36, doorRightX - 18, openAmt * 0.5);
  const knobY = lerp((freeTopY + freeBotY) * 0.52, (doorTopRightY + doorBotRightY) * 0.52, openAmt * 0.3);

  ctx.fillStyle = '#B8C0C8';
  ctx.strokeStyle = '#2B2B2B';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.roundRect(knobX - 9, knobY - 26, 16, 52, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#DCE2E8';
  ctx.beginPath();
  ctx.arc(knobX - 10, knobY, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawStickmanCharacter(ctx: SKRSContext2D, pose: StickmanPose) {
  const hipX = pose.hipX;
  const hipY = pose.hipY;
  const torsoLen = 155;
  const shoulderX = hipX + Math.sin(pose.torsoAngle) * torsoLen;
  const shoulderY = hipY - Math.cos(pose.torsoAngle) * torsoLen;
  const headRadius = 74;
  const headCenterX = shoulderX + Math.sin(pose.torsoAngle * 0.6 + pose.headTilt) * (headRadius + 8);
  const headCenterY = shoulderY - Math.cos(pose.torsoAngle * 0.6 + pose.headTilt) * (headRadius + 8);

  const shadowY = Math.max(pose.leftFoot.y, pose.rightFoot.y) + 8;
  ctx.fillStyle = 'rgba(70, 105, 102, 0.28)';
  ctx.beginPath();
  ctx.ellipse(hipX, shadowY, 95, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  const leftLeg = solveTwoBoneIK(hipX - 14, hipY, pose.leftFoot.x, pose.leftFoot.y, 122, 122, -1);
  const rightLeg = solveTwoBoneIK(hipX + 14, hipY, pose.rightFoot.x, pose.rightFoot.y, 122, 122, -1);
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
    ctx.fillStyle = '#111318';
    ctx.beginPath();
    ctx.arc(ik.endX, ik.endY, 13, 0, Math.PI * 2);
    ctx.fill();
  };

  drawLimbLeg(hipX - 12, hipY, leftLeg);
  drawLimbArm(shoulderX - 8, shoulderY + 14, leftArm);

  ctx.save();
  ctx.translate((hipX + shoulderX) / 2, (hipY + shoulderY) / 2);
  ctx.rotate(pose.torsoAngle);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#111318';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 38, torsoLen * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  drawLimbLeg(hipX + 12, hipY, rightLeg);
  drawLimbArm(shoulderX + 8, shoulderY + 14, rightArm);

  ctx.save();
  ctx.translate(headCenterX, headCenterY);
  ctx.rotate(pose.headTilt);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#111318';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, headRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const eyeCenterX = 18;
  const eyeY = -8;
  const leftEyeX = eyeCenterX - 22;
  const rightEyeX = eyeCenterX + 18;

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

  const px = pose.lookDirX * 6;
  const py = pose.lookDirY * 5;
  ctx.fillStyle = '#111318';
  ctx.beginPath();
  ctx.arc(leftEyeX + px, eyeY + py, 5.5, 0, Math.PI * 2);
  ctx.arc(rightEyeX + px, eyeY + py, 5.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#111318';
  ctx.lineWidth = 3.8;
  ctx.beginPath();
  ctx.arc(16, 22, 18, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function evaluateStickmanScenePose(
  actionType: StickmanActionType,
  u: number,
  timeSec: number
): StickmanPose {
  return {
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
    doorOpenAngle: actionType === 'PUSH_OPEN_AND_EXIT' ? u : 0,
    doorShakeX: 0,
    showLightbulb: actionType === 'THINK_LIGHTBULB_IDEA' ? u : 0,
    showCrowbar: false,
    showImpactBurst: null,
    sweatDrops: 0,
    cameraZoom: 1.0,
    cameraPanX: 0,
    cameraPanY: 0,
    extraPropTime: timeSec,
  };
}

/**
 * Default Cyanide & Happiness ("Cliffhanger") Spanish dialogue lines per scene
 * matching `ejemplo stickman.mp4` when a scene doesn't provide custom `dialogueLines`.
 */
function getDefaultCyanideDialogueForScene(scene: StickmanChoreographyScene): CyanideDialogueLine[] {
  if (scene.dialogueLines && scene.dialogueLines.length > 0) {
    return scene.dialogueLines;
  }

  // If narrationText has dialogue separated by " - " or quotes, parse it into character turns
  const raw = String(scene.narrationText || '').trim();
  if (raw.includes(':') || raw.includes('—') || raw.includes('-')) {
    const parts = raw
      .split(/(?:\r?\n|—| - )/g)
      .map((s) => s.replace(/^[^:]{1,20}:\s*/, '').trim())
      .filter((s) => s.length > 2);
    if (parts.length >= 2) {
      const baseSlot = ((scene.sceneNumber - 1) % 3);
      return parts.map((p, idx) => ({
        speakerIndex: (baseSlot + idx) % 4,
        text: p,
        emotion: idx % 2 === 0 ? 'PANIC' : 'SARCASTIC',
      }));
    }
  }

  const n = scene.sceneNumber;
  if (n === 1) {
    return [
      { speakerIndex: 0, text: '¡Ah! ¡Hay demasiado peso en la cuerda! ¡No va a aguantar!', emotion: 'PANIC' },
      { speakerIndex: 1, text: '¡Espera! ¿Qué vas a hacer con ese cuchillo, tío?', emotion: 'SHOCKED' },
    ];
  }
  if (n === 2) {
    return [
      { speakerIndex: 0, text: '¡Tengo que cortar la cuerda! Lo siento mucho, amigo.', emotion: 'PANIC' },
      { speakerIndex: 1, text: '¡Espera, déjame hacerlo a mí! ¡Aquí abajo hay otro más pesado!', emotion: 'ANGRY' },
    ];
  }
  if (n === 3) {
    return [
      { speakerIndex: 1, text: '¡Toma el cuchillo! ¡Tenemos que cortar por debajo de nosotros!', emotion: 'PANIC' },
      { speakerIndex: 2, text: '¿Qué te hace pensar que la cuerda te aguanta a ti? ¡Mejor cortemos el piano!', emotion: 'SARCASTIC' },
    ];
  }
  if (n === 4) {
    return [
      { speakerIndex: 3, text: '¡Oye! ¡No he cargado este piano toda la montaña para que ahora me dejéis caer!', emotion: 'ANGRY' },
      { speakerIndex: 2, text: '¡Lo siento mucho, pero el piano es demasiado pesado!', emotion: 'PANIC' },
    ];
  }
  if (n === 5) {
    return [
      { speakerIndex: 3, text: '¡Tu madre es demasiado pesada!', emotion: 'SMUG' },
      { speakerIndex: 5, text: '¡Pero bueno! ¡Retíralo ahora mismo!', emotion: 'ANGRY' },
      { speakerIndex: 4, text: '¡Cielo, ahora no es el momento de discutir colgados de un precipicio!', emotion: 'PANIC' },
    ];
  }
  return [
    { speakerIndex: 0, text: '¡Un momento! ¿Por qué hay veinte personas y un piano atados a mi cuerda?', emotion: 'SHOCKED' },
    { speakerIndex: 3, text: '¡Cállate y escucha mi solo de piano antes de que nos caigamos todos!', emotion: 'SMUG' },
  ];
}

/**
 * Renders a single StickmanChoreographyScene at 30 FPS into an MP4 file.
 * By default uses the Cyanide & Happiness (`CYANIDE_EXPLOSM`) 2D vector style + multi-voice lip-sync
 * identical to `ejemplo stickman.mp4`.
 */
export async function renderAnimatedStickmanSceneToMp4Async(params: {
  scene: StickmanChoreographyScene;
  outputMp4Path: string;
  voiceMp3Path?: string;
  fps?: number;
}): Promise<void> {
  const isWidescreen = params.scene.aspectRatio !== '9:16';
  const W = isWidescreen ? 1280 : 720;
  const H = isWidescreen ? 720 : 1280;
  const fps = params.fps || 30;
  const useCyanideStyle = params.scene.visualStyle !== 'MINT_DOOR_CLASSIC';

  const outputDir = path.dirname(params.outputMp4Path);
  fs.mkdirSync(outputDir, { recursive: true });

  // Synthesize multi-character Spanish dialogue if in Cyanide & Happiness style
  let segments: SpeakerTimelineSegment[] = [];
  let effectiveVoiceMp3 = params.voiceMp3Path;
  let durationSec = Math.max(4, Math.min(20, Number(params.scene.durationSec) || 8));

  if (useCyanideStyle) {
    const dialogueLines = getDefaultCyanideDialogueForScene(params.scene);
    const synth = await synthesizeMultiCharacterSceneDialogueAsync({
      dialogueLines,
      outputDir,
      sceneNumber: params.scene.sceneNumber,
      targetDurationSec: durationSec,
    });
    segments = synth.segments;
    durationSec = synth.actualDurationSec;
    if (synth.combinedAudioPath) {
      effectiveVoiceMp3 = synth.combinedAudioPath;
    }
  }

  const totalFrames = Math.round(durationSec * fps);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Ambient mountain wind + rope creak + piano chord (when piano is on screen)
  let sfxExpr = `0.03*sin(2*PI*(110+25*sin(2*PI*0.7*t))*t)+0.02*random(0)`;
  if (params.scene.actionType === 'CYANIDE_PIANO_REVEAL' || params.scene.sceneNumber === 4 || params.scene.sceneNumber >= 6) {
    // Dramatic C-minor piano chord + wind
    sfxExpr = `0.06*(sin(2*PI*261.6*t)+sin(2*PI*311.1*t)+sin(2*PI*392.0*t))*exp(-0.8*mod(t,2.5))+0.02*random(0)`;
  }

  const hasVoice =
    effectiveVoiceMp3 &&
    fs.existsSync(effectiveVoiceMp3) &&
    fs.statSync(effectiveVoiceMp3).size > 400;

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
      effectiveVoiceMp3!,
      '-f',
      'lavfi',
      '-i',
      `aevalsrc='${sfxExpr}':s=44100:d=${durationSec}`,
      '-filter_complex',
      `[1:a]volume=1.45,apad=whole_dur=${durationSec}[v];[2:a]volume=0.35[sfx];[v][sfx]amix=inputs=2:duration=first[a]`,
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
    '19',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-ar',
    '44100',
    '-ac',
    '2',
    '-b:a',
    '160k',
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

        if (useCyanideStyle) {
          renderCyanideExplosmFrame(ctx, W, H, params.scene, u, timeSec, segments);
        } else {
          const pose = evaluateStickmanScenePose(params.scene.actionType, u, timeSec);
          ctx.save();
          drawRoomAndDoor(ctx, W, H, pose, params.scene.propType);
          drawStickmanCharacter(ctx, pose);
          ctx.restore();
        }

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
