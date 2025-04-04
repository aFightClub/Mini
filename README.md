# Mini

A simple desktop application for optimizing images for web use.

## Features

- Select and process multiple images at once
- Minify/optimize images for web
- Convert images to WebP format (optional)
- Overwrite original images with optimized versions
- Track progress with per-image and overall progress bars
- Monitor total processing time

## Tech Stack

- Electron v35
- React
- TypeScript
- Sharp (for image processing)

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```

### Running in Development Mode

```
npm run dev
```

This will start the Vite dev server and the Electron application.

### Building

```
npm run build
npm run make
```

The first command builds the React application, and the second creates the Electron distributables.

## License

MIT
