export type ToolId = 'machadinho' | 'picareta' | 'foice';

type FloatingToolOptions = {
  time: number;
  angle: number;
  timer: number;
  duration: number;
  reach: number;
};

type Point = readonly [number, number];

const OUTLINE = '#382f2b';
const WOOD_DARK = '#68452f';
const WOOD_MID = '#9a6940';
const WOOD_LIGHT = '#c18a55';
const STEEL_DARK = '#52616a';
const STEEL_MID = '#9aaab2';
const STEEL_LIGHT = '#dbe5e9';
const LEATHER_DARK = '#4b3028';
const LEATHER_MID = '#82513a';
const LEATHER_LIGHT = '#b77b50';

function polygon(ctx: CanvasRenderingContext2D, points: Point[], fill: string, lineWidth = 1.2) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function line(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawHandle(ctx: CanvasRenderingContext2D, length: number, r: number) {
  polygon(ctx, [[0,-r*.09],[length*.83,-r*.055],[length,r*.015],[length*.96,r*.13],[length*.12,r*.15],[0,r*.07]], WOOD_DARK);
  polygon(ctx, [[r*.1,-r*.065],[length*.78,-r*.025],[length*.91,r*.035],[length*.13,r*.105]], WOOD_MID, 1);
  polygon(ctx, [[r*.18,-r*.07],[length*.7,-r*.035],[length*.74,-r*.005],[r*.2,-r*.035]], WOOD_LIGHT, .8);
  line(ctx, [[r*.45,r*.11],[length*.43,r*.09]], '#6d472e', .8);
  line(ctx, [[length*.48,-r*.025],[length*.68,-r*.01]], '#d0a06b', .8);
  line(ctx, [[length*.72,r*.075],[length*.86,r*.08]], '#6d472e', .8);
  polygon(ctx, [[0,-r*.1],[r*.16,-r*.1],[r*.16,r*.12],[0,r*.1]], LEATHER_DARK, 1);
  polygon(ctx, [[r*.025,-r*.08],[r*.12,-r*.08],[r*.12,r*.08],[r*.025,r*.07]], LEATHER_MID, .8);
  line(ctx, [[r*.04,-r*.045],[r*.12,-r*.045]], LEATHER_LIGHT, .65);
  polygon(ctx, [[-r*.055,-r*.12],[r*.08,-r*.12],[r*.13,-r*.04],[r*.13,r*.1],[r*.04,r*.15],[-r*.055,r*.08]], STEEL_DARK, 1);
  polygon(ctx, [[-r*.035,-r*.09],[r*.045,-r*.09],[r*.075,-r*.025],[r*.075,r*.065],[r*.02,r*.1],[-r*.035,r*.055]], STEEL_MID, .8);
}

function drawAxe(ctx: CanvasRenderingContext2D, r: number) {
  const handleLength = 2 * r;
  drawHandle(ctx, handleLength, r);
  polygon(ctx, [[r*1.18,-r*.16],[r*1.38,-r*.31],[r*1.52,-r*.26],[r*1.52,r*.08],[r*1.32,r*.17],[r*1.18,r*.08]], STEEL_DARK);
  polygon(ctx, [[r*1.25,-r*.13],[r*1.38,-r*.24],[r*1.47,-r*.19],[r*1.46,r*.045],[r*1.32,r*.1]], STEEL_MID, 1);
  polygon(ctx, [[r*1.42,-r*.19],[r*1.55,-r*.43],[r*1.8,-r*.48],[r*1.92,-r*.34],[r*1.88,r*.22],[r*1.68,r*.43],[r*1.51,r*.28]], STEEL_DARK);
  polygon(ctx, [[r*1.51,-r*.25],[r*1.62,-r*.39],[r*1.79,-r*.42],[r*1.84,-r*.3],[r*1.76,r*.05],[r*1.61,r*.22]], STEEL_MID);
  polygon(ctx, [[r*1.62,-r*.36],[r*1.78,-r*.4],[r*1.84,-r*.29],[r*1.76,r*.05],[r*1.68,r*.11]], STEEL_LIGHT, .9);
  line(ctx, [[r*1.77,-r*.35],[r*1.72,r*.07]], '#f4fbff', 1.3);
  polygon(ctx, [[r*1.48,-r*.2],[r*1.58,-r*.31],[r*1.63,-r*.26],[r*1.58,-r*.1]], '#b9c8ce', .9);
  polygon(ctx, [[r*1.36,-r*.16],[r*1.46,-r*.18],[r*1.48,-r*.1],[r*1.39,-r*.06]], STEEL_LIGHT, .8);
  polygon(ctx, [[r*1.32,r*.13],[r*1.4,r*.15],[r*1.43,r*.21],[r*1.35,r*.2]], '#7d8d95', .8);
  polygon(ctx, [[r*1.28,-r*.03],[r*1.36,-r*.05],[r*1.38,r*.02],[r*1.3,r*.04]], '#7d8d95', .8);
}

function drawPick(ctx: CanvasRenderingContext2D, r: number) {
  const handleLength = 2.2 * r;
  drawHandle(ctx, handleLength, r);
  polygon(ctx, [[r*1.44,-r*.13],[r*1.5,-r*.31],[r*1.68,-r*.38],[r*1.91,-r*.47],[r*2.05,-r*.42],[r*1.91,-r*.3],[r*1.72,-r*.2],[r*1.65,-r*.05],[r*1.52,r*.08]], STEEL_DARK);
  polygon(ctx, [[r*1.52,-r*.16],[r*1.57,-r*.27],[r*1.69,-r*.31],[r*1.9,-r*.4],[r*1.97,-r*.4],[r*1.85,-r*.32],[r*1.67,-r*.13],[r*1.61,r*.01]], STEEL_MID, 1);
  polygon(ctx, [[r*1.7,-r*.31],[r*1.9,-r*.4],[r*1.97,-r*.4],[r*1.85,-r*.32],[r*1.74,-r*.23]], STEEL_LIGHT, .8);
  polygon(ctx, [[r*1.46,-r*.15],[r*1.37,-r*.3],[r*1.22,-r*.39],[r*1.05,-r*.37],[r*1.16,-r*.25],[r*1.29,-r*.16],[r*1.36,r*.01],[r*1.51,r*.1]], STEEL_DARK);
  polygon(ctx, [[r*1.44,-r*.13],[r*1.35,-r*.25],[r*1.23,-r*.33],[r*1.14,-r*.33],[r*1.24,-r*.24],[r*1.34,-r*.12],[r*1.4,r*.025]], STEEL_MID, 1);
  polygon(ctx, [[r*1.14,-r*.33],[r*1.24,-r*.24],[r*1.34,-r*.12],[r*1.28,-r*.17]], STEEL_LIGHT, .8);
  polygon(ctx, [[r*1.4,-r*.2],[r*1.57,-r*.24],[r*1.65,-r*.13],[r*1.59,r*.03],[r*1.43,r*.1],[r*1.34,-r*.02]], STEEL_DARK);
  polygon(ctx, [[r*1.42,-r*.15],[r*1.54,-r*.19],[r*1.59,-r*.12],[r*1.55,r*.005],[r*1.44,r*.05],[r*1.39,-r*.02]], STEEL_MID, .9);
  polygon(ctx, [[r*1.38,-r*.12],[r*1.46,-r*.18],[r*1.49,-r*.12],[r*1.45,-r*.05]], STEEL_LIGHT, .8);
  polygon(ctx, [[r*1.39,-r*.2],[r*1.52,-r*.25],[r*1.58,-r*.17],[r*1.56,-r*.06],[r*1.42,r*.01],[r*1.35,-r*.07]], '#a6b6be', .9);
  polygon(ctx, [[r*1.39,-r*.19],[r*1.46,-r*.22],[r*1.49,-r*.16],[r*1.44,-r*.11]], STEEL_LIGHT, .8);
  polygon(ctx, [[r*1.34,-r*.16],[r*1.4,-r*.18],[r*1.43,-r*.1],[r*1.37,-r*.07]], '#8798a1', .8);
  polygon(ctx, [[r*1.36,-r*.18],[r*1.4,-r*.19],[r*1.42,-r*.14],[r*1.38,-r*.12]], '#d5e1e6', .7);
  // Socket and its two visible rivets.
  polygon(ctx, [[r*1.35,-r*.18],[r*1.57,-r*.23],[r*1.62,-r*.12],[r*1.57,r*.02],[r*1.37,r*.08],[r*1.29,-r*.04]], STEEL_DARK);
  polygon(ctx, [[r*1.38,-r*.15],[r*1.54,-r*.19],[r*1.58,-r*.11],[r*1.53,-r*.015],[r*1.39,r*.035],[r*1.34,-r*.04]], STEEL_MID, .9);
  polygon(ctx, [[r*1.4,-r*.105],[r*1.45,-r*.12],[r*1.47,-r*.07],[r*1.42,-r*.05]], STEEL_LIGHT, .7);
  polygon(ctx, [[r*1.51,-r*.14],[r*1.55,-r*.15],[r*1.57,-r*.1],[r*1.52,-r*.085]], '#dce7eb', .7);
}

function drawSickle(ctx: CanvasRenderingContext2D, r: number) {
  const handleLength = 1.3 * r;
  drawHandle(ctx, handleLength, r);
  polygon(ctx, [[r*1.02,-r*.11],[r*1.18,-r*.2],[r*1.28,-r*.12],[r*1.23,r*.07],[r*1.08,r*.12],[r*.98,r*.035]], STEEL_DARK);
  polygon(ctx, [[r*1.05,-r*.08],[r*1.17,-r*.15],[r*1.23,-r*.1],[r*1.19,r*.035],[r*1.09,r*.075]], STEEL_MID, .9);
  polygon(ctx, [[r*1.08,-r*.12],[r*1.17,-r*.15],[r*1.2,-r*.1],[r*1.15,-r*.06]], STEEL_LIGHT, .8);
  // Faceted crescent strip, segmented into short polygons rather than a raster curve.
  const outer: Point[] = [[r*1.16,-r*.16],[r*1.43,-r*.38],[r*1.7,-r*.57],[r*1.98,-r*.65],[r*2.18,-r*.58],[r*2.27,-r*.43],[r*2.21,-r*.29],[r*2.08,-r*.21]];
  const inner: Point[] = [[r*1.29,-r*.11],[r*1.48,-r*.28],[r*1.72,-r*.43],[r*1.95,-r*.49],[r*2.1,-r*.45],[r*2.15,-r*.39],[r*2.07,-r*.34],[r*1.99,-r*.33]];
  for (let i=0;i<outer.length-1;i++) {
    const tone = i < 3 ? STEEL_DARK : i < 6 ? STEEL_MID : STEEL_LIGHT;
    polygon(ctx, [outer[i],outer[i+1],inner[i+1],inner[i]], tone, .8);
  }
  line(ctx, [[r*1.3,-r*.105],[r*1.49,-r*.27],[r*1.73,-r*.42],[r*1.96,-r*.48],[r*2.1,-r*.44],[r*2.14,-r*.39]], '#f1f8fb', 1.2);
  line(ctx, [[r*1.4,-r*.34],[r*1.68,-r*.53],[r*1.96,-r*.61]], '#657780', .9);
}

export function drawTool(ctx: CanvasRenderingContext2D, tool: ToolId, r: number): void {
  ctx.save();
  if (tool === 'machadinho') drawAxe(ctx, r);
  else if (tool === 'picareta') drawPick(ctx, r);
  else drawSickle(ctx, r);
  ctx.restore();
}

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

export function drawFloatingTool(
  ctx: CanvasRenderingContext2D,
  tool: ToolId,
  r: number,
  opts: FloatingToolOptions,
): void {
  const { time, angle, timer, duration } = opts;
  if (timer <= 0 || duration <= 0) return;

  // The resource direction selects the side of the overhead chop, but the
  // tool's grip stays close to the character instead of thrusting outward.
  const progress = Math.max(0, Math.min(1, 1 - timer / duration));
  const side = Math.cos(angle) >= 0 ? 1 : -1;
  const arcProgress = smooth(progress);
  const rotation = side > 0
    ? -Math.PI / 2 + arcProgress * (Math.PI / 2)
    : -Math.PI / 2 - arcProgress * (Math.PI / 2);

  // Keep the pivot near the hand for the entire swing. The tool head itself
  // travels through the arc: from 12 o'clock down to 3 or 9 o'clock.
  const handleX = side * r * 1.5;
  const handleY = -r * 0.12;
  const fadeOut = Math.min(1, (1 - progress) / 0.08);

  ctx.save();
  ctx.globalAlpha *= fadeOut;
  ctx.translate(handleX, handleY);
  ctx.rotate(rotation);
  const bob = Math.sin(time * 8 + (tool === 'machadinho' ? 0 : tool === 'picareta' ? 1.8 : 3.2)) * 0.25 * (1 - progress);
  ctx.translate(0, bob);
  drawTool(ctx, tool, r);
  ctx.restore();
}
