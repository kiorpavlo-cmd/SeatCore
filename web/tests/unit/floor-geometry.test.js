import { describe, it, expect } from "vitest";
import { moveGeometry, resizeGeometry, rotateGeometry, tableGeometry, nextTableName, roomScene } from "../../src/features/floor/geometry.js";
const g = {x:100,y:100,width:100,height:60,rotation:0};
describe("floor geometry",()=>{
 it("preserves legacy table dimensions and saved metadata",()=>{expect(tableGeometry(["1",20,40,"round"])).toMatchObject({width:62,height:62});expect(tableGeometry(["1",20,40,"side",4,{width:150,height:80,rotation:35}])).toMatchObject({width:150,height:80,rotation:35});});
 it("moves continuously without snapping a click to a grid",()=>{expect(moveGeometry(g,0,0)).toEqual(g);expect(moveGeometry(g,2,3)).toMatchObject({x:102,y:103});expect(moveGeometry(g,-200,2000)).toMatchObject({x:0,y:840});});
 it("resizes from opposite anchors and enforces minimum size",()=>{expect(resizeGeometry(g,"nw",20,10)).toMatchObject({x:120,y:110,width:80,height:50});expect(resizeGeometry(g,"se",-200,-200)).toMatchObject({x:100,y:100,width:24,height:24});});
 it("resizes in the rotated object's axes",()=>{expect(resizeGeometry({...g,rotation:90},"e",0,40)).toMatchObject({width:140,height:60,x:80,y:120});});
 it("rotates around its center",()=>{expect(rotateGeometry(g,{x:200,y:130},{x:150,y:180}).rotation).toBe(90);});
 it("creates unique numeric names and retains an intentionally empty scene",()=>{expect(nextTableName([["1"],["3"]])).toBe("2");expect(roomScene({floorScenes:[{room:"main",objects:[]}]},"main")).toEqual([]);});
});
