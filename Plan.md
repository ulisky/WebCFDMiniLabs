# Web CFD Mini Labs: Laminar Flow Simulator

## Project Overview
This project builds a local, browser-based Computational Fluid Dynamics (CFD) simulator. It uses a Lattice Boltzmann Method (LBM D2Q9) solver to simulate laminar water flow through 2D micro-channels. 

The pipeline consists of two parts:
1. **Geometry Generator:** A modified version of `vector_studio_v5_2.html` that exports solid-stroke SVGs.
2. **CFD Simulator:** A modular vanilla JavaScript web app that parses the SVG into a collision grid, allows users to paint inlet/outlet boundary conditions, and renders real-time velocity heatmaps and streamlines.

---

## Repository Architecture

Ensure the repository follows this exact structure before initiating agent tasks:

```text
/WebCFDMiniLabs
 ├── vector_studio_v5_2.html    # Modded geometry generator (Existing)
 ├── index.html                 # Simulator entry point (New)
 ├── style.css                  # UI Styles (New)
 └── src/
      ├── main.js               # Orchestrator & UI Event Listeners
      ├── geometry.js           # SVG Parser & Canvas Rasterizer
      ├── solver.js             # Lattice Boltzmann Method (LBM) Engine
      └── renderer.js           # Heatmap & Streamline graphics
```

---

## Agentic Execution Plan

*Instructions for the Developer/Agent: Execute these phases sequentially. Do not attempt to build the entire application in a single prompt. Verify functionality after each phase.*

### Phase 1: Patching the Geometry Generator
**Context:** `vector_studio_v5_2.html` currently exports hollow paths for laser cutters. We need solid, thick strokes for CFD walls.

**Agent Prompt:**
> I have a file in the root called `vector_studio_v5_2.html`. It currently exports SVGs optimized for laser cutting. I need you to add a new export button for CFD simulation that keeps the strokes solid and thick.
> 
> 1. Find the `<footer class="controls-bar">` and inside the `<div class="ctrl-group">` next to the `btnDownload`, add a new button with `id="btnDownloadCFD"` labeled 'Exportar CFD'. Make its background blue (`#4f8ef7`) to distinguish it.
> 2. At the bottom of the `<script>` tag, add an event listener for `btnDownloadCFD`. It should:
>    - Clone the `svgCanvas`.
>    - Remove `#previewLayer`, `#gridLayer`, and `#backgroundTemplate` from the clone.
>    - Iterate through all children of `#studentWorkspace` in the clone and set their `stroke` attribute to `#000000`, but *keep* their original `stroke-width`.
>    - **Do NOT** call `optimizeForLaserCutting()`. 
>    - Serialize the clone and trigger a download of `geometria_fluidos.svg`.

### Phase 2: The Ingestion & Rasterization Module
**Context:** Converting the vector SVG into a discrete grid of 1s (walls) and 0s (fluid) for the math solver.

**Agent Prompt:**
> Create `src/geometry.js` and `index.html`. 
> 
> 1. In `index.html`, create a simple UI with an `<input type="file" id="svgUpload" accept=".svg">`, a `<canvas id="simCanvas" width="200" height="200"></canvas>`, and a 'Start Simulation' button.
> 2. In `src/geometry.js`, export a function `parseSVGToGrid(file)`. 
>    - It should read the uploaded SVG file and draw it onto an offscreen 200x200 canvas.
>    - Extract the `ImageData`.
>    - Return a `Uint8Array` of length 40000 (200 * 200). 
>    - Iterate through the pixels: If a pixel is black/dark (the SVG stroke), set the array index to `1` (Wall). If it is white/transparent, set it to `0` (Fluid).
> 3. Connect this to `src/main.js` so that when a user uploads the SVG exported from Phase 1, it renders the black walls onto `simCanvas`.

### Phase 3: The Boundary Condition Painter
**Context:** Allowing the user to define where fluid enters and exits the system.

**Agent Prompt:**
> Update `src/main.js` to allow users to paint boundary conditions on `simCanvas` before the simulation starts.
> 
> 1. Add mouse event listeners to `simCanvas` (mousedown, mousemove, mouseup).
> 2. When the user holds the Left Mouse Button and drags, update the underlying grid array: set those cells to `2` (Inlet) and paint them RED on the canvas.
> 3. When the user holds the Right Mouse Button (prevent the context menu) and drags, set those cells to `3` (Outlet) and paint them BLUE on the canvas.
> 4. Ensure these states are saved in the 1D grid array so they can be passed to the physics solver.

### Phase 4: The Physics Engine (LBM D2Q9)
**Context:** The core fluid dynamics solver using the Lattice Boltzmann Method.

**Agent Prompt:**
> Create `src/solver.js`. Implement a 2D Lattice Boltzmann Method (D2Q9) solver optimized for JavaScript.
> 
> 1. Export a `class LBMSolver`. Its constructor should accept the 200x200 `Uint8Array` grid from Phase 3.
> 2. Initialize 1D `Float32Arrays` (length 200 * 200 * 9) for the microscopic distributions `f` and `f_new`.
> 3. Initialize 1D `Float32Arrays` (length 200 * 200) for macroscopic variables: `rho` (density), `ux` (velocity X), and `uy` (velocity Y).
> 4. Implement a `step()` method that performs:
>    - **Collision:** BGK approximation. Use a relaxation time `tau = 1.0` (representing water-like viscosity).
>    - **Streaming:** Move populations to neighbor nodes.
>    - **Boundaries:** >       - If grid is `1` (Wall): apply standard bounce-back (reverse direction).
>       - If grid is `2` (Inlet): Force `ux = 0.05`, `uy = 0.0` (Zou/He or equilibrium boundary).
>       - If grid is `3` (Outlet): Open boundary (zero-gradient or fixed density `rho = 1.0`).
> 5. Implement a getter that returns the macroscopic `ux` and `uy` arrays for rendering.

### Phase 5: The Visualization Engine
**Context:** Turning numbers into the heatmaps and streamlines seen in COMSOL.

**Agent Prompt:**
> Create `src/renderer.js`. This will render the output of the `LBMSolver` onto `simCanvas` during the animation loop.
> 
> 1. Export a `class Renderer`. 
> 2. **Heatmap:** Create a method `drawHeatmap(ux, uy)`. Calculate the velocity magnitude `V = Math.sqrt(ux*ux + uy*uy)` for every cell. Map `V` to an RGB colormap (e.g., 0.0 is Dark Blue, high velocity is Red). Write these RGB values to an `ImageData` object and put it on the canvas. Draw the walls (`grid === 1`) as solid Black.
> 3. **Streamlines:** Create a particle system.
>    - Maintain an array of 500 particle objects with `{x, y}` coordinates.
>    - Every frame, advect the particles using the `ux, uy` velocity fields (use nearest neighbor for simplicity, or bilinear interpolation if possible).
>    - Draw white, semi-transparent short lines (`lineTo`) behind the particles to form streamlines.
>    - If a particle hits a wall, goes out of bounds, or reaches an Outlet, respawn it at a random Inlet cell.

### Phase 6: The Main Loop Integration
**Context:** Tying the UI, Math, and Graphics together in a high-performance loop.

**Agent Prompt:**
> Update `src/main.js` to tie it all together.
> 
> 1. When the 'Start Simulation' button is clicked, disable canvas painting.
> 2. Instantiate `new LBMSolver(grid)` and `new Renderer(canvas, grid)`.
> 3. Create a `requestAnimationFrame` loop.
> 4. Inside the loop, run `solver.step()` roughly 10-15 times per frame to speed up the simulation visually.
> 5. Call `renderer.drawHeatmap(solver.ux, solver.uy)` and `renderer.drawStreamlines(solver.ux, solver.uy)` once per frame.

---

## Core Constraints & Agent Directives
* **No Frameworks:** Stick strictly to Vanilla JavaScript and HTML5 Canvas. React/Vue introduces unnecessary overhead for LBM memory management and animation loops.
* **Strict Typing:** LBM requires millions of calculations per second. The agent MUST use `Float32Array` for the solver arrays. Standard arrays will crash or lag the browser.
* **Grid Limits:** Hardcode the simulation grid limit to `200x200`. Larger grids require WebGL/GPU shaders, which falls outside the scope of this Vanilla JS implementation.