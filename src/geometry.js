const GRID_SIZE = 200;

export function parseSVGToGrid(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const blob = new Blob([reader.result], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      const img  = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = GRID_SIZE;
        canvas.height = GRID_SIZE;
        const ctx = canvas.getContext('2d');

        /* White fill first: transparent SVG regions must rasterize as
           solid block (wall), not as black, once composited onto the grid. */
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
        ctx.drawImage(img, 0, 0, GRID_SIZE, GRID_SIZE);

        const { data } = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE);
        const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);

        /* The student's drawn strokes are the hollow micro-channels bored
           into a solid block: dark ink -> fluid, everything else -> wall. */
        for (let i = 0; i < grid.length; i++) {
          const r = data[i * 4];
          const g = data[i * 4 + 1];
          const b = data[i * 4 + 2];
          const brightness = (r + g + b) / 3;
          grid[i] = brightness < 128 ? 0 : 1;
        }

        URL.revokeObjectURL(url);
        resolve(grid);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo cargar el SVG como imagen.'));
      };

      img.src = url;
    };

    reader.onerror = () => reject(new Error('No se pudo leer el archivo SVG.'));
    reader.readAsText(file);
  });
}
