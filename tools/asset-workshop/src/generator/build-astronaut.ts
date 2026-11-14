import * as THREE from 'three';
import { createMountNode, createPalette, makeMesh, quatKeyframes, vecKeyframes } from '../materials/pbr-palette';

export interface GeneratedAsset {
  id: string;
  root: THREE.Group;
  clips: THREE.AnimationClip[];
}

export function buildAstronautAsset(): GeneratedAsset {
  const p = createPalette();
  const root = new THREE.Group();
  root.name = 'astronaut_root';

  // Hips (pelvis center at y = 0.92m for a ~1.78m astronaut in suit)
  const hips = new THREE.Group();
  hips.name = 'hips';
  hips.position.set(0, 0.92, 0);
  root.add(hips);

  hips.add(
    makeMesh('pelvis_mesh', new THREE.BoxGeometry(0.32, 0.16, 0.22), p.suitWhite, [0, 0, 0]),
    makeMesh('belt_ring_mesh', new THREE.BoxGeometry(0.336, 0.045, 0.236), p.suitJointGray, [0, 0.06, 0]),
  );

  // Spine -> Chest -> Neck -> Head
  const spine = new THREE.Group();
  spine.name = 'spine';
  spine.position.set(0, 0.09, 0);
  hips.add(spine);

  spine.add(
    makeMesh('abdomen_mesh', new THREE.CylinderGeometry(0.145, 0.14, 0.16, 10), p.suitJointGray, [0, 0.08, 0]),
  );

  const chest = new THREE.Group();
  chest.name = 'chest';
  chest.position.set(0, 0.16, 0);
  spine.add(chest);

  chest.add(
    makeMesh('torso_upper_mesh', new THREE.BoxGeometry(0.38, 0.32, 0.25), p.suitWhite, [0, 0.16, 0]),
    // Chest DCM (Display & Control Module) offset forward to avoid coplanar overlap
    makeMesh('chest_dcm_box', new THREE.BoxGeometry(0.18, 0.14, 0.05), p.hullMid, [0, 0.16, 0.155]),
    makeMesh('chest_dcm_screen', new THREE.BoxGeometry(0.12, 0.055, 0.014), p.consoleScreenBlue, [0, 0.18, 0.186]),
    makeMesh('chest_led_ok', new THREE.BoxGeometry(0.025, 0.02, 0.014), p.ledGreen, [-0.04, 0.12, 0.186]),
    makeMesh('chest_led_comm', new THREE.BoxGeometry(0.025, 0.02, 0.014), p.ledCyan, [0.04, 0.12, 0.186]),
    makeMesh('shoulder_stripe_l', new THREE.BoxGeometry(0.06, 0.024, 0.262), p.suitAccentOrange, [-0.14, 0.318, 0]),
    makeMesh('shoulder_stripe_r', new THREE.BoxGeometry(0.06, 0.024, 0.262), p.suitAccentOrange, [0.14, 0.318, 0]),
  );

  // PLSS Life-Support Backpack attached to chest
  const backpack = new THREE.Group();
  backpack.name = 'backpack';
  backpack.position.set(0, 0.17, -0.2);
  chest.add(backpack);

  backpack.add(
    makeMesh('plss_main_housing', new THREE.BoxGeometry(0.32, 0.42, 0.15), p.suitWhite, [0, 0, 0]),
    makeMesh('plss_top_riser', new THREE.BoxGeometry(0.28, 0.09, 0.12), p.hullMid, [0, 0.255, 0.01]),
    makeMesh('plss_o2_tank_l', new THREE.CylinderGeometry(0.048, 0.048, 0.32, 10), p.frameSteel, [-0.09, -0.02, -0.09]),
    makeMesh('plss_o2_tank_r', new THREE.CylinderGeometry(0.048, 0.048, 0.32, 10), p.frameSteel, [0.09, -0.02, -0.09]),
    makeMesh('plss_beacon_led', new THREE.BoxGeometry(0.04, 0.022, 0.022), p.ledGreen, [0, 0.28, -0.06]),
  );
  const backpackMount = createMountNode('backpack_mount', [0, 0, -0.09]);
  backpack.add(backpackMount);

  // Neck & Head + Helmet + Visor
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.33, 0);
  chest.add(neck);

  neck.add(
    makeMesh('neck_ring_mesh', new THREE.CylinderGeometry(0.115, 0.125, 0.045, 12), p.frameSteel, [0, 0.02, 0]),
  );

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.05, 0);
  neck.add(head);

  const helmet = new THREE.Group();
  helmet.name = 'helmet';
  helmet.position.set(0, 0.13, 0);
  head.add(helmet);

  helmet.add(
    makeMesh('helmet_shell', new THREE.BoxGeometry(0.27, 0.28, 0.28), p.suitWhite, [0, 0, 0]),
    makeMesh('helmet_crown_trim', new THREE.BoxGeometry(0.12, 0.03, 0.292), p.suitAccentOrange, [0, 0.145, 0]),
    makeMesh('helmet_lamp_l', new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), p.frameSteel, [-0.148, 0.05, 0.03], [Math.PI / 2, 0, 0]),
    makeMesh('helmet_lamp_r', new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), p.frameSteel, [0.148, 0.05, 0.03], [Math.PI / 2, 0, 0]),
  );

  const visor = new THREE.Group();
  visor.name = 'visor';
  visor.position.set(0, 0.01, 0.148);
  helmet.add(visor);
  visor.add(
    makeMesh('visor_shield_mesh', new THREE.BoxGeometry(0.21, 0.16, 0.03), p.visorDarkGlass, [0, 0, 0]),
  );

  // Arms builder (Left = -1, Right = +1)
  const buildArm = (side: 'l' | 'r', sign: -1 | 1) => {
    const shoulder = new THREE.Group();
    shoulder.name = `shoulder_${side}`;
    shoulder.position.set(sign * 0.22, 0.27, 0);
    chest.add(shoulder);

    shoulder.add(
      makeMesh(`shoulder_joint_${side}`, new THREE.SphereGeometry(0.068, 10, 8), p.suitJointGray, [0, 0, 0]),
    );

    const upperArm = new THREE.Group();
    upperArm.name = `upper_arm_${side}`;
    upperArm.position.set(sign * 0.03, -0.02, 0);
    shoulder.add(upperArm);

    upperArm.add(
      makeMesh(`upper_arm_mesh_${side}`, new THREE.CylinderGeometry(0.056, 0.05, 0.24, 10), p.suitWhite, [0, -0.12, 0]),
      makeMesh(`arm_band_${side}`, new THREE.CylinderGeometry(0.059, 0.059, 0.035, 10), p.suitAccentOrange, [0, -0.1, 0]),
    );

    const forearm = new THREE.Group();
    forearm.name = `forearm_${side}`;
    forearm.position.set(0, -0.25, 0);
    upperArm.add(forearm);

    forearm.add(
      makeMesh(`elbow_joint_${side}`, new THREE.SphereGeometry(0.052, 8, 8), p.suitJointGray, [0, 0, 0]),
      makeMesh(`forearm_mesh_${side}`, new THREE.CylinderGeometry(0.048, 0.044, 0.22, 10), p.suitWhite, [0, -0.11, 0]),
      makeMesh(`wrist_cuff_${side}`, new THREE.CylinderGeometry(0.051, 0.051, 0.03, 10), p.frameSteel, [0, -0.21, 0]),
    );

    const hand = new THREE.Group();
    hand.name = `hand_${side}`;
    hand.position.set(0, -0.23, 0);
    forearm.add(hand);

    hand.add(
      makeMesh(`palm_mesh_${side}`, new THREE.BoxGeometry(0.065, 0.075, 0.038), p.suitJointGray, [0, -0.035, 0]),
    );

    const thumb = new THREE.Group();
    thumb.name = `thumb_${side}`;
    thumb.position.set(-sign * 0.032, -0.03, 0.022);
    hand.add(thumb);
    thumb.add(
      makeMesh(`thumb_mesh_${side}`, new THREE.BoxGeometry(0.022, 0.045, 0.022), p.suitAccentOrange, [0, -0.02, 0.01]),
    );

    const fingers = new THREE.Group();
    fingers.name = `fingers_${side}`;
    fingers.position.set(0, -0.072, 0);
    hand.add(fingers);
    fingers.add(
      makeMesh(`fingers_mesh_${side}`, new THREE.BoxGeometry(0.058, 0.055, 0.03), p.suitWhite, [0, -0.025, 0.004]),
    );

    const handTarget = createMountNode(`hand_target_${side}`, [0, -0.05, 0.02]);
    fingers.add(handTarget);
  };

  buildArm('l', -1);
  buildArm('r', 1);

  // Legs builder (Left = -1, Right = +1)
  const buildLeg = (side: 'l' | 'r', sign: -1 | 1) => {
    const thigh = new THREE.Group();
    thigh.name = `thigh_${side}`;
    thigh.position.set(sign * 0.1, -0.06, 0);
    hips.add(thigh);

    thigh.add(
      makeMesh(`hip_joint_${side}`, new THREE.SphereGeometry(0.078, 8, 8), p.suitJointGray, [0, 0, 0]),
      makeMesh(`thigh_mesh_${side}`, new THREE.CylinderGeometry(0.07, 0.06, 0.34, 10), p.suitWhite, [0, -0.19, 0]),
    );

    const shin = new THREE.Group();
    shin.name = `shin_${side}`;
    shin.position.set(0, -0.39, 0);
    thigh.add(shin);

    shin.add(
      makeMesh(`knee_joint_${side}`, new THREE.SphereGeometry(0.068, 8, 8), p.suitJointGray, [0, 0, 0]),
      makeMesh(`shin_mesh_${side}`, new THREE.CylinderGeometry(0.058, 0.052, 0.33, 10), p.suitWhite, [0, -0.18, 0]),
    );

    const foot = new THREE.Group();
    foot.name = `foot_${side}`;
    foot.position.set(0, -0.37, 0);
    shin.add(foot);

    foot.add(
      makeMesh(`boot_upper_${side}`, new THREE.BoxGeometry(0.11, 0.08, 0.2), p.suitJointGray, [0, -0.04, 0.035]),
      // Magnetic boot sole plate with distinct thickness
      makeMesh(`boot_mag_sole_${side}`, new THREE.BoxGeometry(0.116, 0.028, 0.212), p.frameSteel, [0, -0.094, 0.035]),
    );
  };

  buildLeg('l', -1);
  buildLeg('r', 1);

  // Stationary reference socket where console switches/buttons align with astronaut's right hand reach
  const handTargetSocket = createMountNode('hand_target', [0.18, 1.24, 0.44]);
  root.add(handTargetSocket);

  // ───────────────────────── Baked Animation Clips (14 Clips) ─────────────────────────
  const clips: THREE.AnimationClip[] = [];

  // 1. idle (2.4s loop, calm breathing & poise, zero root drift)
  clips.push(
    new THREE.AnimationClip('idle', 2.4, [
      new THREE.VectorKeyframeTrack(
        'hips.position',
        [0, 0.6, 1.2, 1.8, 2.4],
        vecKeyframes([
          [0, 0.92, 0],
          [0, 0.932, 0],
          [0, 0.92, 0],
          [0, 0.912, 0],
          [0, 0.92, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'chest.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [0.02, 0, 0],
          [-0.025, 0.03, 0],
          [0.02, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'head.quaternion',
        [0, 0.8, 1.6, 2.4],
        quatKeyframes([
          [0, 0, 0],
          [-0.03, 0.06, 0],
          [0.02, -0.05, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [0.06, 0, 0.12],
          [-0.04, 0, 0.15],
          [0.06, 0, 0.12],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [0.06, 0, -0.12],
          [-0.04, 0, -0.15],
          [0.06, 0, -0.12],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_l.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [-0.28, 0, 0],
          [-0.34, 0, 0],
          [-0.28, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_r.quaternion',
        [0, 1.2, 2.4],
        quatKeyframes([
          [-0.28, 0, 0],
          [-0.34, 0, 0],
          [-0.28, 0, 0],
        ]),
      ),
    ]),
  );

  // 2. run (1.0s loop, in-place magnetic boot run cycle, periodic endpoints)
  clips.push(
    new THREE.AnimationClip('run', 1.0, [
      new THREE.VectorKeyframeTrack(
        'hips.position',
        [0, 0.25, 0.5, 0.75, 1.0],
        vecKeyframes([
          [0, 0.9, 0],
          [0, 0.955, 0],
          [0, 0.9, 0],
          [0, 0.955, 0],
          [0, 0.9, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'chest.quaternion',
        [0, 0.25, 0.5, 0.75, 1.0],
        quatKeyframes([
          [0.16, -0.08, 0],
          [0.14, 0, 0],
          [0.16, 0.08, 0],
          [0.14, 0, 0],
          [0.16, -0.08, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0, 0.25, 0.5, 0.75, 1.0],
        quatKeyframes([
          [-0.55, 0, 0],
          [0.05, 0, 0],
          [0.48, 0, 0],
          [-0.1, 0, 0],
          [-0.55, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_r.quaternion',
        [0, 0.25, 0.5, 0.75, 1.0],
        quatKeyframes([
          [0.48, 0, 0],
          [-0.1, 0, 0],
          [-0.55, 0, 0],
          [0.05, 0, 0],
          [0.48, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'shin_l.quaternion',
        [0, 0.25, 0.5, 0.75, 1.0],
        quatKeyframes([
          [0.25, 0, 0],
          [0.75, 0, 0],
          [0.35, 0, 0],
          [0.15, 0, 0],
          [0.25, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'shin_r.quaternion',
        [0, 0.25, 0.5, 0.75, 1.0],
        quatKeyframes([
          [0.35, 0, 0],
          [0.15, 0, 0],
          [0.25, 0, 0],
          [0.75, 0, 0],
          [0.35, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 0.5, 1.0],
        quatKeyframes([
          [0.45, 0, 0.14],
          [-0.5, 0, 0.14],
          [0.45, 0, 0.14],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.5, 1.0],
        quatKeyframes([
          [-0.5, 0, -0.14],
          [0.45, 0, -0.14],
          [-0.5, 0, -0.14],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_l.quaternion',
        [0, 0.5, 1.0],
        quatKeyframes([
          [-0.65, 0, 0],
          [-0.85, 0, 0],
          [-0.65, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_r.quaternion',
        [0, 0.5, 1.0],
        quatKeyframes([
          [-0.85, 0, 0],
          [-0.65, 0, 0],
          [-0.85, 0, 0],
        ]),
      ),
    ]),
  );

  // 3. float_idle (3.0s loop, weightless neutral body posture in zero-G)
  clips.push(
    new THREE.AnimationClip('float_idle', 3.0, [
      new THREE.VectorKeyframeTrack(
        'hips.position',
        [0, 0.75, 1.5, 2.25, 3.0],
        vecKeyframes([
          [0, 1.08, 0],
          [0.015, 1.13, 0.01],
          [0, 1.08, 0],
          [-0.015, 1.04, -0.01],
          [0, 1.08, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'hips.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [0.14, 0, 0.03],
          [0.19, 0.04, -0.03],
          [0.14, 0, 0.03],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [-0.38, 0, 0.42],
          [-0.48, 0.08, 0.52],
          [-0.38, 0, 0.42],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [-0.38, 0, -0.42],
          [-0.48, -0.08, -0.52],
          [-0.38, 0, -0.42],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_l.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [-0.45, 0, 0],
          [-0.58, 0, 0],
          [-0.45, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_r.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [-0.45, 0, 0],
          [-0.58, 0, 0],
          [-0.45, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [-0.32, 0, 0.08],
          [-0.4, 0, 0.12],
          [-0.32, 0, 0.08],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_r.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [-0.26, 0, -0.08],
          [-0.35, 0, -0.12],
          [-0.26, 0, -0.08],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'shin_l.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [0.48, 0, 0],
          [0.58, 0, 0],
          [0.48, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'shin_r.quaternion',
        [0, 1.5, 3.0],
        quatKeyframes([
          [0.42, 0, 0],
          [0.52, 0, 0],
          [0.42, 0, 0],
        ]),
      ),
    ]),
  );

  // 4. float_move (1.6s loop, zero-G forward glide along handrail, not running in air)
  clips.push(
    new THREE.AnimationClip('float_move', 1.6, [
      new THREE.VectorKeyframeTrack(
        'hips.position',
        [0, 0.8, 1.6],
        vecKeyframes([
          [0, 1.12, 0],
          [0, 1.16, 0.03],
          [0, 1.12, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'hips.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [0.45, 0, 0],
          [0.5, 0.03, 0],
          [0.45, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [-0.95, 0.1, 0.25],
          [-0.65, 0.05, 0.32],
          [-0.95, 0.1, 0.25],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [-0.65, -0.05, -0.32],
          [-0.95, -0.1, -0.25],
          [-0.65, -0.05, -0.32],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [0.2, 0, 0.05],
          [0.28, 0, 0.08],
          [0.2, 0, 0.05],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_r.quaternion',
        [0, 0.8, 1.6],
        quatKeyframes([
          [0.28, 0, -0.05],
          [0.2, 0, -0.08],
          [0.28, 0, -0.05],
        ]),
      ),
    ]),
  );

  // 5. push_off (1.1s one-shot, push off from handrail/bulkhead into zero-G glide)
  clips.push(
    new THREE.AnimationClip('push_off', 1.1, [
      new THREE.VectorKeyframeTrack(
        'hips.position',
        [0, 0.35, 0.75, 1.1],
        vecKeyframes([
          [0, 0.92, 0],
          [0, 0.82, -0.06],
          [0, 1.12, 0.08],
          [0, 1.08, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'hips.quaternion',
        [0, 0.35, 0.75, 1.1],
        quatKeyframes([
          [0.1, 0, 0],
          [0.28, 0, 0],
          [0.42, 0, 0],
          [0.16, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0, 0.35, 0.75, 1.1],
        quatKeyframes([
          [-0.2, 0, 0],
          [-0.75, 0, 0],
          [0.22, 0, 0.06],
          [-0.3, 0, 0.06],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_r.quaternion',
        [0, 0.35, 0.75, 1.1],
        quatKeyframes([
          [-0.2, 0, 0],
          [-0.75, 0, 0],
          [0.22, 0, -0.06],
          [-0.3, 0, -0.06],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 0.35, 0.75, 1.1],
        quatKeyframes([
          [-0.3, 0, 0.2],
          [-0.85, 0, 0.25],
          [-1.15, 0, 0.3],
          [-0.4, 0, 0.35],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.35, 0.75, 1.1],
        quatKeyframes([
          [-0.3, 0, -0.2],
          [-0.85, 0, -0.25],
          [-1.15, 0, -0.3],
          [-0.4, 0, -0.35],
        ]),
      ),
    ]),
  );

  // 6. grab_handle (1.1s one-shot, reach out and grasp handrail anchor to stabilize)
  clips.push(
    new THREE.AnimationClip('grab_handle', 1.1, [
      new THREE.VectorKeyframeTrack(
        'hips.position',
        [0, 0.45, 0.85, 1.1],
        vecKeyframes([
          [0, 1.08, 0],
          [0, 1.04, 0.06],
          [0, 0.94, 0.02],
          [0, 0.92, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 0.45, 0.85, 1.1],
        quatKeyframes([
          [-0.4, 0, 0.35],
          [-1.15, 0.15, 0.1],
          [-0.85, 0.1, 0.12],
          [-0.2, 0, 0.14],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_l.quaternion',
        [0, 0.45, 0.85, 1.1],
        quatKeyframes([
          [-0.4, 0, 0],
          [-0.25, 0, 0],
          [-0.65, 0, 0],
          [-0.35, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'fingers_l.quaternion',
        [0, 0.35, 0.65, 1.1],
        quatKeyframes([
          [0, 0, 0],
          [-0.2, 0, 0],
          [0.65, 0, 0],
          [0.2, 0, 0],
        ]),
      ),
    ]),
  );

  // 7. task_work (2.0s loop, two-handed console work cycle at control station)
  clips.push(
    new THREE.AnimationClip('task_work', 2.0, [
      new THREE.QuaternionKeyframeTrack(
        'chest.quaternion',
        [0, 1.0, 2.0],
        quatKeyframes([
          [0.12, -0.04, 0],
          [0.14, 0.04, 0],
          [0.12, -0.04, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'head.quaternion',
        [0, 0.6, 1.4, 2.0],
        quatKeyframes([
          [0.18, -0.08, 0],
          [0.22, 0.08, 0],
          [0.16, -0.04, 0],
          [0.18, -0.08, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 0.5, 1.0, 1.5, 2.0],
        quatKeyframes([
          [-0.68, 0.18, 0.1],
          [-0.78, 0.25, 0.06],
          [-0.62, 0.12, 0.12],
          [-0.74, 0.2, 0.08],
          [-0.68, 0.18, 0.1],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.5, 1.0, 1.5, 2.0],
        quatKeyframes([
          [-0.74, -0.2, -0.08],
          [-0.62, -0.12, -0.12],
          [-0.78, -0.25, -0.06],
          [-0.68, -0.18, -0.1],
          [-0.74, -0.2, -0.08],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_l.quaternion',
        [0, 0.5, 1.0, 1.5, 2.0],
        quatKeyframes([
          [-0.75, 0, 0],
          [-0.58, 0, 0],
          [-0.82, 0, 0],
          [-0.64, 0, 0],
          [-0.75, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_r.quaternion',
        [0, 0.5, 1.0, 1.5, 2.0],
        quatKeyframes([
          [-0.64, 0, 0],
          [-0.82, 0, 0],
          [-0.58, 0, 0],
          [-0.75, 0, 0],
          [-0.64, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'fingers_l.quaternion',
        [0, 0.5, 1.0, 1.5, 2.0],
        quatKeyframes([
          [0.15, 0, 0],
          [0.45, 0, 0],
          [0.1, 0, 0],
          [0.4, 0, 0],
          [0.15, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'fingers_r.quaternion',
        [0, 0.5, 1.0, 1.5, 2.0],
        quatKeyframes([
          [0.4, 0, 0],
          [0.1, 0, 0],
          [0.45, 0, 0],
          [0.15, 0, 0],
          [0.4, 0, 0],
        ]),
      ),
    ]),
  );

  // 8. switch_on (1.2s one-shot: right hand reaches directly to hand_target, flips toggle UP, returns)
  clips.push(
    new THREE.AnimationClip('switch_on', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'chest.quaternion',
        [0, 0.45, 0.7, 1.2],
        quatKeyframes([
          [0.02, 0, 0],
          [0.1, -0.1, 0],
          [0.08, -0.08, 0],
          [0.02, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.4, 0.65, 0.85, 1.2],
        quatKeyframes([
          [0.06, 0, -0.12],
          [-0.92, -0.15, -0.05],
          [-1.08, -0.15, -0.05],
          [-0.88, -0.12, -0.08],
          [0.06, 0, -0.12],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_r.quaternion',
        [0, 0.4, 0.65, 0.85, 1.2],
        quatKeyframes([
          [-0.28, 0, 0],
          [-0.58, 0, 0],
          [-0.42, 0, 0],
          [-0.52, 0, 0],
          [-0.28, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'hand_r.quaternion',
        [0, 0.4, 0.65, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0.22, 0, 0],
          [-0.35, 0, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'fingers_r.quaternion',
        [0, 0.35, 0.65, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0.35, 0, 0],
          [0.1, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
  );

  // 9. switch_off (1.2s one-shot: right hand reaches to hand_target, flips toggle DOWN, returns)
  clips.push(
    new THREE.AnimationClip('switch_off', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'chest.quaternion',
        [0, 0.45, 0.7, 1.2],
        quatKeyframes([
          [0.02, 0, 0],
          [0.1, -0.1, 0],
          [0.12, -0.08, 0],
          [0.02, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.4, 0.65, 0.85, 1.2],
        quatKeyframes([
          [0.06, 0, -0.12],
          [-1.08, -0.15, -0.05],
          [-0.84, -0.15, -0.05],
          [-0.9, -0.12, -0.08],
          [0.06, 0, -0.12],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_r.quaternion',
        [0, 0.4, 0.65, 0.85, 1.2],
        quatKeyframes([
          [-0.28, 0, 0],
          [-0.42, 0, 0],
          [-0.65, 0, 0],
          [-0.5, 0, 0],
          [-0.28, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'hand_r.quaternion',
        [0, 0.4, 0.65, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [-0.28, 0, 0],
          [0.38, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
  );

  // 10. turn_left (0.9s smooth in-place pivot step left without sudden snap)
  clips.push(
    new THREE.AnimationClip('turn_left', 0.9, [
      new THREE.QuaternionKeyframeTrack(
        'hips.quaternion',
        [0, 0.3, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [0, 0.32, 0],
          [0, 0.48, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'head.quaternion',
        [0, 0.25, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [0, 0.28, 0],
          [0, 0.12, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0, 0.3, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [-0.32, 0.18, 0],
          [0, 0.08, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_r.quaternion',
        [0, 0.3, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [0.12, 0, 0],
          [-0.28, -0.1, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
  );

  // 11. turn_right (0.9s smooth in-place pivot step right without sudden snap)
  clips.push(
    new THREE.AnimationClip('turn_right', 0.9, [
      new THREE.QuaternionKeyframeTrack(
        'hips.quaternion',
        [0, 0.3, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [0, -0.32, 0],
          [0, -0.48, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'head.quaternion',
        [0, 0.25, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [0, -0.28, 0],
          [0, -0.12, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_r.quaternion',
        [0, 0.3, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [-0.32, -0.18, 0],
          [0, -0.08, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0, 0.3, 0.6, 0.9],
        quatKeyframes([
          [0, 0, 0],
          [0.12, 0, 0],
          [-0.28, 0.1, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
  );

  // 12. reposition (2.4s demo movement between two console stations and return)
  clips.push(
    new THREE.AnimationClip('reposition', 2.4, [
      new THREE.VectorKeyframeTrack(
        'hips.position',
        [0, 0.4, 1.2, 1.8, 2.4],
        vecKeyframes([
          [0, 0.92, 0],
          [0.22, 0.96, 0.04],
          [0.55, 0.92, 0],
          [0.25, 0.96, -0.04],
          [0, 0.92, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'hips.quaternion',
        [0, 0.4, 1.2, 1.8, 2.4],
        quatKeyframes([
          [0, 0, 0],
          [0.08, 0.35, 0],
          [0, 0, 0],
          [0.08, -0.35, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_l.quaternion',
        [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4],
        quatKeyframes([
          [0, 0, 0],
          [-0.42, 0, 0],
          [0.35, 0, 0],
          [0, 0, 0],
          [-0.42, 0, 0],
          [0.35, 0, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thigh_r.quaternion',
        [0, 0.4, 0.8, 1.2, 1.6, 2.0, 2.4],
        quatKeyframes([
          [0, 0, 0],
          [0.35, 0, 0],
          [-0.42, 0, 0],
          [0, 0, 0],
          [0.35, 0, 0],
          [-0.42, 0, 0],
          [0, 0, 0],
        ]),
      ),
    ]),
  );

  // 13. task_success (1.2s one-shot: affirmative nod & right-arm thumbs-up salute)
  clips.push(
    new THREE.AnimationClip('task_success', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'head.quaternion',
        [0, 0.3, 0.55, 0.8, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0.24, 0, 0],
          [-0.08, 0, 0],
          [0.2, 0, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.35, 0.85, 1.2],
        quatKeyframes([
          [0.06, 0, -0.12],
          [-0.85, -0.1, -0.2],
          [-0.85, -0.1, -0.2],
          [0.06, 0, -0.12],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'forearm_r.quaternion',
        [0, 0.35, 0.85, 1.2],
        quatKeyframes([
          [-0.28, 0, 0],
          [-1.05, 0, 0],
          [-1.05, 0, 0],
          [-0.28, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'thumb_r.quaternion',
        [0, 0.35, 0.85, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [-0.55, 0, -0.35],
          [-0.55, 0, -0.35],
          [0, 0, 0],
        ]),
      ),
    ]),
  );

  // 14. task_error (1.2s one-shot: head shake & warning gesture)
  clips.push(
    new THREE.AnimationClip('task_error', 1.2, [
      new THREE.QuaternionKeyframeTrack(
        'head.quaternion',
        [0, 0.25, 0.5, 0.75, 1.0, 1.2],
        quatKeyframes([
          [0, 0, 0],
          [0.06, 0.32, 0],
          [0.06, -0.32, 0],
          [0.06, 0.26, 0],
          [0.06, -0.22, 0],
          [0, 0, 0],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_l.quaternion',
        [0, 0.35, 0.85, 1.2],
        quatKeyframes([
          [0.06, 0, 0.12],
          [-0.65, 0.1, 0.45],
          [-0.6, 0.1, 0.35],
          [0.06, 0, 0.12],
        ]),
      ),
      new THREE.QuaternionKeyframeTrack(
        'upper_arm_r.quaternion',
        [0, 0.35, 0.85, 1.2],
        quatKeyframes([
          [0.06, 0, -0.12],
          [-0.65, -0.1, -0.45],
          [-0.6, -0.1, -0.35],
          [0.06, 0, -0.12],
        ]),
      ),
    ]),
  );

  return { id: 'astronaut', root, clips };
}
