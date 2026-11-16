export type Phase = "approach" | "sit" | "coding" | "stand" | "return" | "idle";

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Decorative 24s station choreography, never an agent execution status. */
export function poseAt(seconds: number, offset = 0) {
  const t = (((Number.isFinite(seconds) ? seconds : 0) + (Number.isFinite(offset) ? offset : 0)) % 24 + 24) % 24;
  const phase: Phase = t < 3 ? "approach" : t < 4 ? "sit" : t < 18 ? "coding" : t < 19 ? "stand" : t < 22 ? "return" : "idle";
  const travel = t < 3 ? -1.4 * (1 - smooth(t / 3)) : t < 19 ? 0 : t < 22 ? -1.4 * smooth((t - 19) / 3) : -1.4;
  const sit = t < 3 ? 0 : t < 4 ? smooth(t - 3) : t < 18 ? 1 : t < 19 ? 1 - smooth(t - 18) : 0;
  const walking = phase === "approach" || phase === "return";
  const stepTime = phase === "return" ? t - 19 : t;
  const envelope = walking ? Math.sin(Math.PI * stepTime / 3) : 0;
  const gait = Math.sin(stepTime * Math.PI * 4) * envelope;
  // Taper finger motion before transitions so no joint snaps at a phase boundary.
  const typing = phase === "coding" ? Math.min(1, (t - 4) * 2, (18 - t) * 2) : 0;
  const leftHand = typing * Math.sin((t - 4) * Math.PI * 7) * 0.065;
  const rightHand = typing * Math.sin((t - 4) * Math.PI * 7 + Math.PI / 2) * 0.065;
  return {
    phase, travel, sit,
    leftFoot: Math.max(0, gait) * 0.14,
    rightFoot: Math.max(0, -gait) * 0.14,
    leftStride: gait * 0.18, rightStride: -gait * 0.18,
    leftHand, rightHand,
    leftArm: -gait * 0.28, rightArm: gait * 0.28,
    bob: Math.abs(gait) * 0.025,
  };
}
