import { sidebar } from "./sidebar.js";
import { topbar } from "./topbar.js";
import { floorLayout } from "../features/floor/layout.js";
export const shell = `<div class="app">${sidebar}<main class="workspace">${topbar}${floorLayout}</main></div><div id="popover" class="popover hidden"></div><div id="overlay" class="overlay hidden"><div id="modal" class="modal"></div></div>`;
