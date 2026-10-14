import { escapeHTML as esc } from "../../lib/dom.js";
export const PLAN_WIDTH = 1200;
export const PLAN_HEIGHT = 900;
const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
export function tableGeometry(table) {
  const defaults = table[3] === "round" ? [62, 62] : table[3] === "long" ? [44, 72] : table[3] === "wide" ? [72, 44] : [44, 43];
  const meta = table[5] || {};
  return { x: table[1], y: table[2], width: bounded(meta.width, defaults[0], 24, 1000), height: bounded(meta.height, defaults[1], 24, 800), rotation: bounded(meta.rotation, 0, -360, 360) };
}
export function shapeGeometry(shape) {
  return { x: bounded(shape.x, 0, 0, PLAN_WIDTH), y: bounded(shape.y, 0, 0, PLAN_HEIGHT), width: bounded(shape.width, 70, 24, 1000), height: bounded(shape.height, 50, 24, 800), rotation: bounded(shape.rotation, 0, -360, 360) };
}
export function geometryStyle(g) {
  return `left:${g.x}px;top:${g.y}px;width:${g.width}px;height:${g.height}px;transform:rotate(${g.rotation}deg);`;
}
export function moveGeometry(g, dx, dy) {
  return { ...g, x: Math.max(0, Math.min(PLAN_WIDTH - g.width, g.x + dx)), y: Math.max(0, Math.min(PLAN_HEIGHT - g.height, g.y + dy)) };
}
export function resizeGeometry(g, handle, dx, dy) {
  const angle = g.rotation * Math.PI / 180;
  const lx = dx * Math.cos(angle) + dy * Math.sin(angle);
  const ly = -dx * Math.sin(angle) + dy * Math.cos(angle);
  const width = bounded(g.width + (handle.includes("e") ? lx : handle.includes("w") ? -lx : 0), g.width, 24, 1000);
  const height = bounded(g.height + (handle.includes("s") ? ly : handle.includes("n") ? -ly : 0), g.height, 24, 800);
  const cx = (handle.includes("e") ? width - g.width : handle.includes("w") ? g.width - width : 0) / 2;
  const cy = (handle.includes("s") ? height - g.height : handle.includes("n") ? g.height - height : 0) / 2;
  const result = { ...g, width, height, x: g.x + (g.width - width) / 2 + cx * Math.cos(angle) - cy * Math.sin(angle), y: g.y + (g.height - height) / 2 + cx * Math.sin(angle) + cy * Math.cos(angle) };
  return moveGeometry(result, 0, 0);
}
export function rotateGeometry(g, start, current) {
  const cx = g.x + g.width / 2, cy = g.y + g.height / 2;
  const delta = Math.atan2(current.y - cy, current.x - cx) - Math.atan2(start.y - cy, start.x - cx);
  return { ...g, rotation: ((g.rotation + delta * 180 / Math.PI + 540) % 360) - 180 };
}
export function nextTableName(tables) {
  const used = new Set(tables.map(t => String(t[0])));
  let number = 1;
  while (used.has(String(number))) number++;
  return String(number);
}
function defaultScene(room) {
  const rect = (x,y,width,height,name="") => ({id:`default-${room}-${x}-${y}`, type:"rect",x,y,width,height,name,color:"#dfe1f5",rotation:0});
  if(room === "main") return [rect(28,66,25,72),rect(85,66,290,26,"ВИТРИНА"),rect(540,66,134,26),rect(28,170,25,323),rect(477,185,33,126,"БАР"),rect(355,282,154,33), ...Array.from({length:7},(_,i)=>({id:`tree-${i}`,type:"tree",x:9,y:91+i*49,width:24,height:24,name:"",rotation:0}))];
  if(room === "terrace") return [rect(27,30,49,515),rect(65,54,225,49,"ВИННЫЙ МАГАЗИН"),rect(323,38,305,270),rect(323,396,295,140)];
  return [];
}
export function roomScene(resources, room) {
  const entry = resources.floorScenes?.find(s=>s.room===room);
  return entry && Array.isArray(entry.objects) ? entry.objects : defaultScene(room);
}
export function sceneMarkup(objects, editable=false) {
  return objects.map((shape,index) => {
    const type = ["rect","circle","tree"].includes(shape.type) ? shape.type : "rect";
    const color = /^#[0-9a-f]{6}$/i.test(shape.color || "") ? shape.color : "#dfe1f5";
    return `<${editable ? "button" : "div"} class="plan-shape plan-shape-${type}" ${editable ? `data-shape-index="${index}" aria-label="${esc(shape.name || ({rect:"Прямоугольник",circle:"Круг",tree:"Дерево"}[type]))}"` : ""} style="${geometryStyle(shapeGeometry(shape))}background:${type === "tree" ? "transparent" : color}">${type === "tree" ? "" : esc(shape.name || "")}</${editable ? "button" : "div"}>`;
  }).join("");
}
