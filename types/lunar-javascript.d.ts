declare module 'lunar-javascript' {
  export const Solar: {
    fromYmd: (
      year: number,
      month: number,
      day: number,
    ) => {
      getLunar: () => {
        getDayYi: () => string[]
        getDayJi: () => string[]
      }
    }
  }
}
