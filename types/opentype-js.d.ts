declare module 'opentype.js' {
  type DrawContext = {
    beginPath: () => void
    moveTo: (x: number, y: number) => void
    lineTo: (x: number, y: number) => void
    bezierCurveTo: (
      cp1x: number,
      cp1y: number,
      cp2x: number,
      cp2y: number,
      x: number,
      y: number,
    ) => void
    quadraticCurveTo: (
      cpx: number,
      cpy: number,
      x: number,
      y: number,
    ) => void
    closePath: () => void
    fill: () => void
    stroke: () => void
  }

  type FontPath = {
    fill: string
    draw: (ctx: DrawContext) => void
  }

  type Font = {
    getAdvanceWidth: (text: string, fontSize: number) => number
    getPath: (
      text: string,
      x: number,
      y: number,
      fontSize: number,
    ) => FontPath
  }

  const opentype: {
    parse: (buffer: ArrayBuffer | SharedArrayBuffer) => Font
  }

  export default opentype
}
