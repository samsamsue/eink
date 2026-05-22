/// <reference path="../../types/lunar-javascript.d.ts" />
import type { CanvasRenderingContext2D } from 'canvas'
import type { ServerResponse } from 'http'
import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Solar } from 'lunar-javascript'

const DESIGN_WIDTH = 800
const DESIGN_HEIGHT = 600
const WIDTH = 400
const HEIGHT = 300
const RENDER_SCALE = WIDTH / DESIGN_WIDTH
const FONT_FAMILY = 'sans-serif'
const GRAPHICS_MONO_THRESHOLD = 104
const HZK12_ASSET_KEY = 'server:fonts/HZK12'
const HZK16_ASSET_KEY = 'server:fonts/HZK16'
const GB2312_MAP_ASSET_KEY = 'server:fonts/gb2312.txt'
const GB2312_OFFSETS_ASSET_KEY = 'server:fonts/gb2312-offsets.json'

const s = (value: number) => Math.round(value * RENDER_SCALE)
const snap = (value: number) => Math.round(value)

type LoadedFont = {
  bytes: Uint8Array
  family: string
  path: string
}

type BitmapFont = {
  width: number
  height: number
  ascent: number
  baselineOffset: number
  rowBytes: number
  bytes: Uint8Array
}

type BitmapFontState = {
  charIndex: Map<string, number>
  font12: BitmapFont
  font16: BitmapFont
}

type FontState = {
  bitmap: BitmapFontState
  cjk: LoadedFont
  latin: LoadedFont
  fontStack: string
  preset: string
  source: string
}

let fontStatePromise: Promise<FontState> | null = null

const FONT_PRESETS = {
  noto: {
    cjk: 'server:fonts:NotoSansCJKSC-Regular.otf',
    latin: 'server:fonts:NotoSansCJKSC-Regular.otf',
  },
  mplus12: {
    cjk: 'server:fonts:mplus_hzk_12.ttf',
    latin: 'server:fonts:mplus_hzk_12.ttf',
  },
  mplus13: {
    cjk: 'server:fonts:mplus_hzk_13.ttf',
    latin: 'server:fonts:mplus_hzk_13.ttf',
  },
} as const

type FontPresetName = keyof typeof FONT_PRESETS
let activeFontPreset: FontPresetName = 'noto'

const readFontAsset = async (key: string) => {
  const buffer = await useStorage('/assets').getItemRaw(key)

  if (!buffer) {
    throw new Error(`Missing font asset: ${key}`)
  }

  return buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
}

const readTextAsset = async (key: string) => {
  const buffer = await readFontAsset(key)
  return new TextDecoder('utf-8').decode(buffer)
}

const loadFonts = async (): Promise<FontState> => {
  if (!fontStatePromise) {
    fontStatePromise = (async () => {
      const { registerFont } = await getCanvasModule()
      const fontPreset = FONT_PRESETS[activeFontPreset]
      const cjkFamily = `EinkCJK-${activeFontPreset}`
      const latinFamily = `EinkLatin-${activeFontPreset}`
      const [cjkFontBytes, latinFontBytes, hzk12Bytes, hzk16Bytes, gb2312Map, gb2312Offsets] = await Promise.all([
        readFontAsset(fontPreset.cjk),
        readFontAsset(fontPreset.latin),
        readFontAsset(HZK12_ASSET_KEY),
        readFontAsset(HZK16_ASSET_KEY),
        readTextAsset(GB2312_MAP_ASSET_KEY),
        readTextAsset(GB2312_OFFSETS_ASSET_KEY),
      ])
      const fontCacheDir = await getFontCacheDir()
      const cjkFontPath = join(fontCacheDir, 'cjk-font.otf')
      const latinFontPath = join(fontCacheDir, 'latin-font.otf')
      const charIndex = new Map<string, number>(Object.entries(JSON.parse(gb2312Offsets) as Record<string, number>))

      void gb2312Map

      await Promise.all([
        writeFile(cjkFontPath, cjkFontBytes),
        writeFile(latinFontPath, latinFontBytes),
      ])

      registerFont(cjkFontPath, { family: cjkFamily })
      registerFont(latinFontPath, { family: latinFamily })

      return {
        bitmap: {
          charIndex,
          font12: {
            width: 12,
            height: 12,
            ascent: 10,
            baselineOffset: 1,
            rowBytes: 2,
            bytes: hzk12Bytes,
          },
          font16: {
            width: 16,
            height: 16,
            ascent: 13,
            baselineOffset: 1,
            rowBytes: 2,
            bytes: hzk16Bytes,
          },
        },
        cjk: {
          bytes: cjkFontBytes,
          family: cjkFamily,
          path: cjkFontPath,
        },
        latin: {
          bytes: latinFontBytes,
          family: latinFamily,
          path: latinFontPath,
        },
        fontStack: `"${latinFamily}", "${cjkFamily}", ${FONT_FAMILY}`,
        preset: activeFontPreset,
        source: 'canvas-registerFont',
      }
    })().catch((error) => {
      fontStatePromise = null
      throw error
    })
  }

  return fontStatePromise
}

let canvasModulePromise: Promise<typeof import('canvas')> | null = null

const getCanvasModule = async () => {
  canvasModulePromise ||= import('canvas')
  return canvasModulePromise
}

let fontCacheDirPromise: Promise<string> | null = null

const getFontCacheDir = async () => {
  fontCacheDirPromise ||= mkdir(join(tmpdir(), 'eink-font-cache'), { recursive: true }).then(() => (
    join(tmpdir(), 'eink-font-cache')
  ))
  return fontCacheDirPromise
}

type HotItem = {
  tag: string
  title: string
}

type WeiboHotBandItem = {
  ad_channel?: unknown
  label_name?: string
  word?: string
}

type TodoItem = {
  title?: string
}

type PushOptions = {
  dither?: string
  pageId?: string
}

const fallbackHotList: HotItem[] = []

type WeatherNow = {
  text: string
  code: string
  temperature: string
  humidity?: string
  wind_speed?: string
}

type WeatherPayload = {
  temperature: string
  text: string
  humidity: string
  windSpeed: string
  code: string
}

type DatePayload = {
  date: string
  weekday: string
  lunar: string
}

type AlmanacPayload = {
  yi: string[]
  ji: string[]
}

type DateParts = {
  year: number
  month: number
  day: number
}

type Observance = {
  name: string
  month: number
  day: number
  lunar?: boolean
}

const defaultWeather: WeatherPayload = {
  temperature: '25',
  text: '多云',
  humidity: '50',
  windSpeed: '13',
  code: '4',
}

const defaultTodoTip = '把电脑的系统装成Debian'
const defaultAlmanac: AlmanacPayload = {
  yi: ['搬家', '入伙', '理发'],
  ji: ['结婚', '同房'],
}

const solarObservances: Observance[] = [
  { month: 1, day: 1, name: '元旦' },
  { month: 2, day: 14, name: '情人节' },
  { month: 3, day: 8, name: '妇女节' },
  { month: 3, day: 12, name: '植树节' },
  { month: 4, day: 1, name: '愚人节' },
  { month: 5, day: 1, name: '劳动节' },
  { month: 5, day: 4, name: '青年节' },
  { month: 6, day: 1, name: '儿童节' },
  { month: 7, day: 1, name: '建党节' },
  { month: 8, day: 1, name: '建军节' },
  { month: 9, day: 10, name: '教师节' },
  { month: 10, day: 1, name: '国庆节' },
  { month: 10, day: 31, name: '万圣节' },
  { month: 12, day: 24, name: '平安夜' },
  { month: 12, day: 25, name: '圣诞节' },
]

const lunarObservances: Observance[] = [
  { month: 1, day: 1, name: '春节', lunar: true },
  { month: 1, day: 15, name: '元宵节', lunar: true },
  { month: 5, day: 5, name: '端午节', lunar: true },
  { month: 7, day: 7, name: '七夕节', lunar: true },
  { month: 7, day: 15, name: '中元节', lunar: true },
  { month: 8, day: 15, name: '中秋节', lunar: true },
  { month: 9, day: 9, name: '重阳节', lunar: true },
  { month: 12, day: 8, name: '腊八节', lunar: true },
]

const solarTermsByYear: Record<number, Observance[]> = {
  2026: [
    { month: 1, day: 5, name: '小寒' },
    { month: 1, day: 20, name: '大寒' },
    { month: 2, day: 4, name: '立春' },
    { month: 2, day: 18, name: '雨水' },
    { month: 3, day: 5, name: '惊蛰' },
    { month: 3, day: 20, name: '春分' },
    { month: 4, day: 5, name: '清明' },
    { month: 4, day: 20, name: '谷雨' },
    { month: 5, day: 5, name: '立夏' },
    { month: 5, day: 21, name: '小满' },
    { month: 6, day: 5, name: '芒种' },
    { month: 6, day: 21, name: '夏至' },
    { month: 7, day: 7, name: '小暑' },
    { month: 7, day: 23, name: '大暑' },
    { month: 8, day: 7, name: '立秋' },
    { month: 8, day: 23, name: '处暑' },
    { month: 9, day: 7, name: '白露' },
    { month: 9, day: 23, name: '秋分' },
    { month: 10, day: 8, name: '寒露' },
    { month: 10, day: 23, name: '霜降' },
    { month: 11, day: 7, name: '立冬' },
    { month: 11, day: 22, name: '小雪' },
    { month: 12, day: 7, name: '大雪' },
    { month: 12, day: 21, name: '冬至' },
  ],
  2027: [
    { month: 1, day: 5, name: '小寒' },
    { month: 1, day: 20, name: '大寒' },
    { month: 2, day: 4, name: '立春' },
    { month: 2, day: 19, name: '雨水' },
    { month: 3, day: 6, name: '惊蛰' },
    { month: 3, day: 21, name: '春分' },
    { month: 4, day: 5, name: '清明' },
    { month: 4, day: 20, name: '谷雨' },
    { month: 5, day: 6, name: '立夏' },
    { month: 5, day: 21, name: '小满' },
    { month: 6, day: 6, name: '芒种' },
    { month: 6, day: 21, name: '夏至' },
    { month: 7, day: 7, name: '小暑' },
    { month: 7, day: 23, name: '大暑' },
    { month: 8, day: 8, name: '立秋' },
    { month: 8, day: 23, name: '处暑' },
    { month: 9, day: 8, name: '白露' },
    { month: 9, day: 23, name: '秋分' },
    { month: 10, day: 8, name: '寒露' },
    { month: 10, day: 23, name: '霜降' },
    { month: 11, day: 7, name: '立冬' },
    { month: 11, day: 22, name: '小雪' },
    { month: 12, day: 7, name: '大雪' },
    { month: 12, day: 22, name: '冬至' },
  ],
}

const lunarDayMap: Record<string, string> = {
  '1日': '初一',
  '2日': '初二',
  '3日': '初三',
  '4日': '初四',
  '5日': '初五',
  '6日': '初六',
  '7日': '初七',
  '8日': '初八',
  '9日': '初九',
  '10日': '初十',
  '11日': '十一',
  '12日': '十二',
  '13日': '十三',
  '14日': '十四',
  '15日': '十五',
  '16日': '十六',
  '17日': '十七',
  '18日': '十八',
  '19日': '十九',
  '20日': '二十',
  '21日': '廿一',
  '22日': '廿二',
  '23日': '廿三',
  '24日': '廿四',
  '25日': '廿五',
  '26日': '廿六',
  '27日': '廿七',
  '28日': '廿八',
  '29日': '廿九',
  '30日': '三十',
}

const getShanghaiDateParts = (date = new Date()): DateParts => {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value || '1970'),
    month: Number(parts.find((part) => part.type === 'month')?.value || '1'),
    day: Number(parts.find((part) => part.type === 'day')?.value || '1'),
  }
}

const getLunarDateParts = (date = new Date()): Pick<DateParts, 'month' | 'day'> => {
  const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)

  return {
    month: Number(parts.find((part) => part.type === 'month')?.value || '1'),
    day: Number(parts.find((part) => part.type === 'day')?.value || '1'),
  }
}

const toUtcDay = (date: DateParts) => Date.UTC(date.year, date.month - 1, date.day)

const getNextObservance = (now = new Date()) => {
  const today = getShanghaiDateParts(now)
  const todayUtc = toUtcDay(today)

  for (let offset = 0; offset <= 370; offset++) {
    const date = new Date(todayUtc + offset * 86400000)
    const solarDate = getShanghaiDateParts(date)
    const lunarDate = getLunarDateParts(date)
    const solarHit = solarObservances.find((item) => (
      item.month === solarDate.month && item.day === solarDate.day
    ))
    const termHit = (solarTermsByYear[solarDate.year] || []).find((item) => (
      item.month === solarDate.month && item.day === solarDate.day
    ))
    const lunarHit = lunarObservances.find((item) => (
      item.month === lunarDate.month && item.day === lunarDate.day
    ))
    const hit = solarHit || termHit || lunarHit

    if (hit) {
      return offset === 0 ? hit.name : `${offset}天后${hit.name}`
    }
  }

  return ''
}

const getRealtimeDate = (now = new Date()): DatePayload => {
  const dateParts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(now)
  const month = dateParts.find((part) => part.type === 'month')?.value || '01'
  const day = dateParts.find((part) => part.type === 'day')?.value || '01'
  const weekday = dateParts.find((part) => part.type === 'weekday')?.value || '星期一'
  const lunarRaw = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
    timeZone: 'Asia/Shanghai',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const lunar = lunarRaw.replace(/(\d+日)/, (value) => lunarDayMap[value] || value)

  return {
    date: `${month}月${day}日`,
    weekday,
    lunar,
  }
}

const getRealtimeAlmanac = (now = new Date()): AlmanacPayload => {
  try {
    const date = getShanghaiDateParts(now)
    const lunar = Solar.fromYmd(date.year, date.month, date.day).getLunar()

    return {
      yi: lunar.getDayYi().slice(0, 3),
      ji: lunar.getDayJi().slice(0, 3),
    }
  } catch {
    return defaultAlmanac
  }
}

const weatherIconPaths = {
  sun: [
    '<circle cx="12" cy="12" r="4"/>',
    '<path d="M12 2v2"/>',
    '<path d="M12 20v2"/>',
    '<path d="m4.93 4.93 1.41 1.41"/>',
    '<path d="m17.66 17.66 1.41 1.41"/>',
    '<path d="M2 12h2"/>',
    '<path d="M20 12h2"/>',
    '<path d="m6.34 17.66-1.41 1.41"/>',
    '<path d="m19.07 4.93-1.41 1.41"/>',
  ],
  cloudSun: [
    '<path d="M12 2v2"/>',
    '<path d="m4.93 4.93 1.41 1.41"/>',
    '<path d="M20 12h2"/>',
    '<path d="m19.07 4.93-1.41 1.41"/>',
    '<path d="M15.95 12.65A4 4 0 1 0 11.35 8.05"/>',
    '<path d="M17.5 19H9a5 5 0 1 1 4.9-6H18a3 3 0 0 1-.5 6Z"/>',
  ],
  cloud: [
    '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  ],
  rain: [
    '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    '<path d="M8 19v2"/>',
    '<path d="M8 13v2"/>',
    '<path d="M16 19v2"/>',
    '<path d="M16 13v2"/>',
    '<path d="M12 21v2"/>',
    '<path d="M12 15v2"/>',
  ],
  snow: [
    '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    '<path d="M8 15h.01"/>',
    '<path d="M8 19h.01"/>',
    '<path d="M12 17h.01"/>',
    '<path d="M12 21h.01"/>',
    '<path d="M16 15h.01"/>',
    '<path d="M16 19h.01"/>',
  ],
  lightning: [
    '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
    '<path d="m13 14-2 4h3l-2 4"/>',
  ],
  fog: [
    '<path d="M17.5 17H9a5 5 0 1 1 4.9-6H18a3 3 0 0 1-.5 6Z"/>',
    '<path d="M5 21h14"/>',
    '<path d="M3 17h2"/>',
    '<path d="M19 17h2"/>',
  ],
}

const getWeatherIconName = (code: string, text: string) => {
  const normalizedText = text.toLowerCase()
  const codeNumber = Number(code)

  if (normalizedText.includes('雷') || codeNumber === 13 || codeNumber === 14 || codeNumber === 15) {
    return 'lightning'
  }

  if (normalizedText.includes('雪') || (codeNumber >= 20 && codeNumber <= 25)) {
    return 'snow'
  }

  if (
    normalizedText.includes('雨')
    || normalizedText.includes('阵雨')
    || (codeNumber >= 10 && codeNumber <= 19)
  ) {
    return 'rain'
  }

  if (
    normalizedText.includes('雾')
    || normalizedText.includes('霾')
    || normalizedText.includes('沙')
    || normalizedText.includes('尘')
    || (codeNumber >= 26 && codeNumber <= 31)
  ) {
    return 'fog'
  }

  if (normalizedText.includes('云') || codeNumber === 4 || codeNumber === 5 || codeNumber === 6) {
    return 'cloudSun'
  }

  if (normalizedText.includes('阴') || codeNumber === 9) {
    return 'cloud'
  }

  return 'sun'
}

const fetchWeather = async (location: string): Promise<WeatherPayload> => {
  const params = new URLSearchParams({
    key: 'YEF5BZPH5R',
    location,
    language: 'zh-Hans',
    unit: 'c',
  })

  try {
    const response = await fetch(`https://api.seniverse.com/v3/weather/now.json?${params}`)

    if (!response.ok) {
      return defaultWeather
    }

    const data = await response.json()
    const now = data?.results?.[0]?.now as WeatherNow | undefined

    if (!now) {
      return defaultWeather
    }

    return {
      temperature: now.temperature || defaultWeather.temperature,
      text: now.text || defaultWeather.text,
      humidity: now.humidity || defaultWeather.humidity,
      windSpeed: now.wind_speed || defaultWeather.windSpeed,
      code: now.code || defaultWeather.code,
    }
  } catch {
    return defaultWeather
  }
}

const fetchHotList = async (): Promise<HotItem[]> => {
  try {
    const response = await fetch('https://weibo.com/ajax/statuses/hot_band', {
      headers: {
        referer: 'https://weibo.com/',
        'user-agent': 'Mozilla/5.0',
      },
    })

    if (!response.ok) {
      return fallbackHotList
    }

    const data = await response.json()
    const bandList = data?.data?.band_list

    if (!Array.isArray(bandList)) {
      return fallbackHotList
    }

    const normalizedList = bandList
      .filter((item: WeiboHotBandItem) => !item.ad_channel && item.word)
      .map((item: WeiboHotBandItem) => ({
        tag: item.label_name || '新',
        title: item.word || '',
      }))

    const topFixed = normalizedList.slice(0, 5)
    const remaining = normalizedList.slice(5)

    for (let index = remaining.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1))
      const current = remaining[index]
      remaining[index] = remaining[randomIndex]
      remaining[randomIndex] = current
    }

    const hotList = [...topFixed, ...remaining.slice(0, 3)]

    return hotList.length > 0 ? hotList : fallbackHotList
  } catch {
    return fallbackHotList
  }
}

const fetchTodoTip = async (): Promise<string | null> => {
  const env = useRuntimeConfig()

  if (!env.APIKEY || !env.DEVICEID) {
    return defaultTodoTip
  }

  const params = new URLSearchParams({
    deviceId: env.DEVICEID,
  })

  try {
    const response = await fetch(`https://cloud.zectrix.com/open/v1/todos?${params}`, {
      headers: {
        'X-API-Key': env.APIKEY,
        Accept: 'application/json',
      },
    })

    if (!response.ok) {
      return defaultTodoTip
    }

    const todo = await response.json()
    const todoList = todo?.data

    if (!Array.isArray(todoList)) {
      return defaultTodoTip
    }

    if (todoList.length === 0) {
      return null
    }

    const firstTodo = todoList.find((item: TodoItem) => item.title) as TodoItem | undefined

    return firstTodo?.title || null
  } catch {
    return defaultTodoTip
  }
}

const pushImageToDevice = async (
  buffer: Buffer,
  options: PushOptions,
) => {
  const env = useRuntimeConfig()

  if (!env.APIKEY || !env.DEVICEID) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Missing APIKEY or DEVICEID',
    })
  }

  const formData = new FormData()
  formData.append(
    'images',
    new Blob([new Uint8Array(buffer)], { type: 'image/png' }),
    'image.png',
  )

  if (options.dither) {
    formData.append('dither', options.dither)
  }

  if (options.pageId) {
    formData.append('pageId', options.pageId)
  }

  const response = await fetch(
    `https://cloud.zectrix.com/open/v1/devices/${env.DEVICEID}/display/image`,
    {
      method: 'POST',
      headers: {
        'X-API-Key': env.APIKEY,
      },
      body: formData,
    },
  )
  const result = await response.json().catch(() => null)

  if (!response.ok || result?.code !== 0) {
    throw createError({
      statusCode: response.status || 502,
      statusMessage: result?.msg || 'Failed to push image to device',
    })
  }

  return result
}

const setFont = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: number | 'bold' | 'normal' = 'bold',
) => {
  ctx.font = `${weight} ${s(size)}px ${fonts.fontStack}`
}

const getFontSize = (ctx: CanvasRenderingContext2D) => (
  Number(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16)
)

const toGb2312CompatibleChar = (char: string) => {
  if (/[A-Z]/.test(char)) {
    return String.fromCharCode(char.charCodeAt(0) - 0x41 + 0xff21)
  }

  if (/[a-z]/.test(char)) {
    return String.fromCharCode(char.charCodeAt(0) - 0x61 + 0xff41)
  }

  if (/[0-9]/.test(char)) {
    return String.fromCharCode(char.charCodeAt(0) - 0x30 + 0xff10)
  }

  const symbolMap: Record<string, string> = {
    '%': '％',
    ':': '：',
    '.': '．',
    ',': '，',
    '-': '－',
    '/': '／',
    '(': '（',
    ')': '）',
    '[': '［',
    ']': '］',
    '+': '＋',
    '?': '？',
    '!': '！',
    '@': '＠',
    '&': '＆',
    '*': '＊',
    '#': '＃',
    '=': '＝',
    '<': '＜',
    '>': '＞',
    '\'': '＇',
    '"': '＂',
  }

  return symbolMap[char] || char
}

const getBitmapGlyph = (
  fonts: FontState,
  char: string,
  size: number,
) => {
  const normalizedChar = toGb2312CompatibleChar(char)
  const glyphIndex = fonts.bitmap.charIndex.get(normalizedChar)

  if (glyphIndex == null) {
    return null
  }

  const bitmapFont = size <= 13 ? fonts.bitmap.font12 : fonts.bitmap.font16
  const glyphByteLength = bitmapFont.rowBytes * bitmapFont.height
  const offset = glyphIndex * glyphByteLength

  if (offset + glyphByteLength > bitmapFont.bytes.length) {
    return null
  }

  return {
    char: normalizedChar,
    glyphIndex,
    bitmapFont,
    offset,
  }
}

const getBitmapGlyphAdvance = (
  glyph: NonNullable<ReturnType<typeof getBitmapGlyph>>,
) => {
  const { bitmapFont, offset } = glyph
  let leftmostPixel = bitmapFont.width
  let rightmostPixel = -1

  for (let row = 0; row < bitmapFont.height; row++) {
    for (let byteIndex = 0; byteIndex < bitmapFont.rowBytes; byteIndex++) {
      const value = bitmapFont.bytes[offset + row * bitmapFont.rowBytes + byteIndex]

      if (value === 0) {
        continue
      }

      for (let bit = 0; bit < 8; bit++) {
        if ((value & (0x80 >> bit)) === 0) {
          continue
        }

        const px = byteIndex * 8 + bit

        if (px < bitmapFont.width) {
          leftmostPixel = Math.min(leftmostPixel, px)
          rightmostPixel = Math.max(rightmostPixel, px)
        }
      }
    }
  }

  if (rightmostPixel < 0 || leftmostPixel >= bitmapFont.width) {
    return {
      advance: Math.max(1, Math.floor(bitmapFont.width / 2)),
      leftTrim: 0,
    }
  }

  return {
    advance: rightmostPixel - leftmostPixel + 2,
    leftTrim: leftmostPixel,
  }
}

const measureMixedText = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
) => Array.from(text).reduce((width, char) => {
  const glyph = getBitmapGlyph(fonts, char, size)

  if (glyph) {
    return width + getBitmapGlyphAdvance(glyph).advance
  }

  return width + ctx.measureText(char).width
}, 0)

const drawBitmapText = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
) => {
  const measuredWidth = measureMixedText(fonts, ctx, text, size)

  const drawX = snap(ctx.textAlign === 'right'
    ? x - measuredWidth
    : ctx.textAlign === 'center'
      ? x - measuredWidth / 2
      : x)
  const topYForFallback = ctx.textBaseline === 'middle'
    ? snap(y + size * 0.36)
    : snap(y)
  const originalTextAlign = ctx.textAlign
  const originalTextBaseline = ctx.textBaseline
  let cursorX = drawX

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  for (const char of Array.from(text)) {
    const glyph = getBitmapGlyph(fonts, char, size)

    if (!glyph) {
      ctx.fillText(char, snap(cursorX), topYForFallback)
      cursorX += ctx.measureText(char).width
      continue
    }

    const { bitmapFont, offset } = glyph
    const metrics = getBitmapGlyphAdvance(glyph)
    const topY = originalTextBaseline === 'middle'
      ? snap(y - bitmapFont.height / 2 + bitmapFont.baselineOffset)
      : snap(y - bitmapFont.ascent + bitmapFont.baselineOffset)

    for (let row = 0; row < bitmapFont.height; row++) {
      for (let byteIndex = 0; byteIndex < bitmapFont.rowBytes; byteIndex++) {
        const value = bitmapFont.bytes[offset + row * bitmapFont.rowBytes + byteIndex]

        for (let bit = 0; bit < 8; bit++) {
          if ((value & (0x80 >> bit)) === 0) {
            continue
          }

          const px = cursorX + byteIndex * 8 + bit - metrics.leftTrim

          if (px < cursorX || px >= cursorX + bitmapFont.width) {
            continue
          }

          ctx.fillRect(px, topY + row, 1, 1)
        }
      }
    }

    cursorX += metrics.advance
  }

  ctx.textAlign = originalTextAlign
  ctx.textBaseline = originalTextBaseline

  return true
}

const getFontDebug = async () => {
  const fonts = await loadFonts()

  return {
    preset: fonts.preset,
    source: fonts.source,
    cjkBytes: fonts.cjk.bytes.byteLength,
    latinBytes: fonts.latin.bytes.byteLength,
    cjkFamily: fonts.cjk.family,
    latinFamily: fonts.latin.family,
    cjkPath: fonts.cjk.path,
    latinPath: fonts.latin.path,
  }
}

const measureDisplayText = (
  _fonts: FontState,
  ctx: CanvasRenderingContext2D,
  text: string,
) => ctx.measureText(text).width

const drawBoldText = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  _strokeWidth = 0,
) => {
  const size = getFontSize(ctx)
  if (drawBitmapText(fonts, ctx, text, x, y, size)) {
    return
  }

  const measuredWidth = measureDisplayText(fonts, ctx, text)
  const originalTextAlign = ctx.textAlign
  const originalTextBaseline = ctx.textBaseline
  const drawX = snap(ctx.textAlign === 'right'
    ? x - measuredWidth
    : ctx.textAlign === 'center'
      ? x - measuredWidth / 2
      : x)
  const drawY = snap(ctx.textBaseline === 'middle' ? y + size * 0.36 : y)
  void fonts
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, drawX, drawY)
  ctx.textAlign = originalTextAlign
  ctx.textBaseline = originalTextBaseline
}

const ellipsizeText = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
  const measureText = (value: string) => measureDisplayText(fonts, ctx, value)

  if (measureText(text) <= maxWidth) {
    return text
  }

  let output = text

  while (output.length > 0 && measureText(`${output}...`) > maxWidth) {
    output = output.slice(0, -1)
  }

  return output ? `${output}...` : ''
}

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2)

  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const drawWeatherIcon = async (
  ctx: CanvasRenderingContext2D,
  weather: WeatherPayload,
) => {
  const { loadImage } = await getCanvasModule()
  const iconName = getWeatherIconName(weather.code, weather.text)
  const paths = weatherIconPaths[iconName].join('')
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="-2 -2 28 28"',
    ' fill="none" stroke="#000" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">',
    paths,
    '</svg>',
  ].join('')
  const image = await loadImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)

  ctx.drawImage(image, s(10), s(12), s(101), s(101))
}

const drawAlmanac = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  almanac: AlmanacPayload,
) => {
  ctx.save()

  ctx.fillStyle = '#000'
  ctx.fillRect(s(226), s(24), 1, s(103) - s(24) + 1)
  ctx.fillRect(s(550), s(24), 1, s(103) - s(24) + 1)

  ctx.fillStyle = '#000'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  setFont(fonts, ctx, 26, 'normal')
  drawBoldText(fonts, ctx, ellipsizeText(fonts, ctx, `宜：${almanac.yi.join('、')}`, s(302)), s(240), s(48))
  drawBoldText(fonts, ctx, ellipsizeText(fonts, ctx, `忌：${almanac.ji.join('、')}`, s(302)), s(240), s(83))

  ctx.restore()
}

const drawMessageIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.save()
  ctx.fillStyle = '#fff'
  roundRect(ctx, x, y, s(48), s(36), s(5))
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(x + s(17), y + s(34))
  ctx.lineTo(x + s(10), y + s(48))
  ctx.lineTo(x + s(28), y + s(36))
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#000'
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(x + s(15 + i * 11), y + s(17), s(2.2), 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

const drawHotItem = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  centerY: number,
  tag: string,
  title: string,
) => {
  ctx.fillStyle = '#000'
  roundRect(ctx, s(24), centerY - s(20), s(40), s(40), s(10))
  ctx.fill()

  ctx.fillStyle = '#fff'
  setFont(fonts, ctx, 29, 'normal')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  drawBoldText(fonts, ctx, tag, s(44), centerY)

  ctx.fillStyle = '#000'
  setFont(fonts, ctx, 32, 'normal')
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  drawBoldText(fonts, ctx, title, s(79), centerY)
}

const toMonochromeBuffer = async (
  ctx: CanvasRenderingContext2D,
) => {
  const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const grayscale = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const value = grayscale >= 10 ? 255 : 0

    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
    data[index + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)

  return (ctx.canvas as unknown as { toBuffer: (mimeType: string) => Buffer }).toBuffer('image/png')
}

const applyMonochromeToContext = (
  ctx: CanvasRenderingContext2D,
  threshold = GRAPHICS_MONO_THRESHOLD,
) => {
  const imageData = ctx.getImageData(0, 0, WIDTH, HEIGHT)
  const { data } = imageData

  for (let index = 0; index < data.length; index += 4) {
    const grayscale = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const value = grayscale >= threshold ? 255 : 0

    data[index] = value
    data[index + 1] = value
    data[index + 2] = value
    data[index + 3] = 255
  }

  ctx.putImageData(imageData, 0, 0)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const env = useRuntimeConfig()
  const graphicsThreshold = typeof query.graphicsThreshold === 'string'
    ? Math.max(0, Math.min(255, Number(query.graphicsThreshold) || GRAPHICS_MONO_THRESHOLD))
    : GRAPHICS_MONO_THRESHOLD
  const requestedFontPreset = typeof query.fontPreset === 'string' && query.fontPreset in FONT_PRESETS
    ? query.fontPreset as FontPresetName
    : 'noto'

  if (requestedFontPreset !== activeFontPreset) {
    activeFontPreset = requestedFontPreset
    fontStatePromise = null
  }

  if (env.PW && query.pw !== env.PW) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
    })
  }

  const location = typeof query.location === 'string' && query.location
    ? query.location
    : 'nanshan'
  const preview = query.preview === ''
    || query.preview === '1'
    || query.preview === 'true'
  const debug = query.debug === ''
    || query.debug === '1'
    || query.debug === 'true'
  const fontTest = query.fontTest === ''
    || query.fontTest === '1'
    || query.fontTest === 'true'
  const noPush = query.noPush === ''
    || query.noPush === '1'
    || query.noPush === 'true'
  const pushOptions = {
    dither: typeof query.dither === 'string' ? query.dither : undefined,
    pageId: typeof query.pageId === 'string' ? query.pageId : undefined,
  }
  const [weather, hotList, todoTip] = await Promise.all([
    fetchWeather(location),
    fetchHotList(),
    fetchTodoTip(),
  ])
  const fonts = await loadFonts()
  const { createCanvas } = await getCanvasModule()

  if (debug) {
    return {
      completed: true,
      font: await getFontDebug(),
    }
  }

  const realtimeDate = getRealtimeDate()
  const nextObservance = getNextObservance()
  const almanac = getRealtimeAlmanac()

  const graphicsCanvas = createCanvas(WIDTH, HEIGHT)
  const graphicsCtx = graphicsCanvas.getContext('2d')
  const textCanvas = createCanvas(WIDTH, HEIGHT)
  const textCtx = textCanvas.getContext('2d')
  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  graphicsCtx.antialias = 'gray'
  graphicsCtx.imageSmoothingEnabled = false
  graphicsCtx.fillStyle = '#ffffff'
  graphicsCtx.fillRect(0, 0, WIDTH, HEIGHT)

  textCtx.antialias = 'none'
  textCtx.imageSmoothingEnabled = false

  ctx.antialias = 'none'
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  if (fontTest) {
    textCtx.fillStyle = '#000'
    textCtx.textAlign = 'left'
    textCtx.textBaseline = 'alphabetic'
    setFont(fonts, textCtx, 64, 'normal')
    drawBoldText(fonts, textCtx, '中文测试 ABC123 Debian 25°C', s(30), s(120))
    setFont(fonts, textCtx, 42, 'normal')
    drawBoldText(fonts, textCtx, `font: ${(await getFontDebug()).source}`, s(30), s(200))

    ctx.drawImage(textCanvas, 0, 0)
    const buffer = (canvas as unknown as { toBuffer: (mimeType: string) => Buffer }).toBuffer('image/png')
    const res = event.node.res as ServerResponse
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Length', buffer.length)
    res.end(buffer)
    return
  }

  // Header.
  await drawWeatherIcon(graphicsCtx, weather)

  textCtx.fillStyle = '#000'
  textCtx.textBaseline = 'alphabetic'
  textCtx.textAlign = 'left'
  setFont(fonts, textCtx, 32, 'normal')
  drawBoldText(fonts, textCtx, `${weather.temperature}°C`, s(115), s(58))
  setFont(fonts, textCtx, 33, 'normal')
  drawBoldText(fonts, textCtx, weather.text, s(115), s(99))

  graphicsCtx.save()
  graphicsCtx.fillStyle = '#000'
  graphicsCtx.fillRect(s(226), s(24), 1, s(103) - s(24) + 1)
  graphicsCtx.fillRect(s(550), s(24), 1, s(103) - s(24) + 1)
  graphicsCtx.restore()

  textCtx.fillStyle = '#000'
  textCtx.textAlign = 'left'
  textCtx.textBaseline = 'middle'
  setFont(fonts, textCtx, 26, 'normal')
  drawBoldText(fonts, textCtx, ellipsizeText(fonts, textCtx, `宜：${almanac.yi.join('、')}`, s(302)), s(240), s(48))
  drawBoldText(fonts, textCtx, ellipsizeText(fonts, textCtx, `忌：${almanac.ji.join('、')}`, s(302)), s(240), s(83))

  textCtx.textAlign = 'right'
  setFont(fonts, textCtx, 34, 'normal')
  drawBoldText(fonts, textCtx, realtimeDate.date, s(786), s(54))
  setFont(fonts, textCtx, 27, 'normal')
  drawBoldText(fonts, textCtx, `${realtimeDate.weekday}  ${realtimeDate.lunar}`, s(787), s(86))

  graphicsCtx.fillStyle = '#000'
  graphicsCtx.fillRect(0, s(121), WIDTH, 1)

  // News list.
  textCtx.textAlign = 'left'
  hotList.forEach((item, index) => {
    const centerY = s(156 + index * 44)

    graphicsCtx.fillStyle = '#000'
    roundRect(graphicsCtx, s(24), centerY - s(20), s(40), s(40), s(10))
    graphicsCtx.fill()

    textCtx.fillStyle = '#fff'
    setFont(fonts, textCtx, 29, 'normal')
    textCtx.textAlign = 'center'
    textCtx.textBaseline = 'middle'
    drawBoldText(fonts, textCtx, item.tag, s(44), centerY)

    textCtx.fillStyle = '#000'
    setFont(fonts, textCtx, 32, 'normal')
    textCtx.textAlign = 'left'
    textCtx.textBaseline = 'middle'
    drawBoldText(fonts, textCtx, item.title, s(79), centerY)
  })

  // Footer.
  graphicsCtx.fillStyle = '#000'
  graphicsCtx.fillRect(0, s(506), WIDTH, 1)

  textCtx.fillStyle = '#000'
  setFont(fonts, textCtx, 42, 'normal')
  textCtx.textAlign = 'left'
  textCtx.textBaseline = 'middle'
  drawBoldText(fonts, textCtx, nextObservance, s(16), s(553))

  if (todoTip) {
    const bubbleRight = s(784)
    const bubbleY = s(521)
    const bubbleHeight = s(63)
    const bubbleRadius = s(15)
    const bubbleMaxWidth = s(458)
    const bubbleMinWidth = s(170)
    const bubblePaddingLeft = s(18)
    const bubblePaddingRight = s(24)
    const iconWidth = s(48)
    const iconGap = s(13)
    const textMaxWidth = bubbleMaxWidth - bubblePaddingLeft - iconWidth - iconGap - bubblePaddingRight

    textCtx.fillStyle = '#000'
    setFont(fonts, textCtx, 31, 'normal')
    const todoText = ellipsizeText(fonts, textCtx, todoTip, textMaxWidth)
    const todoTextWidth = measureDisplayText(fonts, textCtx, todoText)
    const bubbleWidth = Math.min(
      bubbleMaxWidth,
      Math.max(
        bubbleMinWidth,
        bubblePaddingLeft + iconWidth + iconGap + todoTextWidth + bubblePaddingRight,
      ),
    )
    const bubbleX = bubbleRight - bubbleWidth
    const iconX = bubbleX + bubblePaddingLeft
    const textX = iconX + iconWidth + iconGap

    graphicsCtx.fillStyle = '#000'
    roundRect(graphicsCtx, bubbleX, bubbleY, bubbleWidth, bubbleHeight, bubbleRadius)
    graphicsCtx.fill()
    drawMessageIcon(graphicsCtx, iconX, s(529))

    textCtx.fillStyle = '#fff'
    setFont(fonts, textCtx, 31, 'normal')
    textCtx.textAlign = 'left'
    textCtx.textBaseline = 'middle'
    drawBoldText(fonts, textCtx, todoText, textX, s(552.5))
  }

  applyMonochromeToContext(graphicsCtx, graphicsThreshold)
  ctx.drawImage(graphicsCanvas, 0, 0)
  ctx.drawImage(textCanvas, 0, 0)
  const buffer = (canvas as unknown as { toBuffer: (mimeType: string) => Buffer }).toBuffer('image/png')
  if (!noPush) {
    await pushImageToDevice(buffer, pushOptions)
  }

  if (!preview) {
    return {
      completed: true,
      pushed: !noPush,
      font: await getFontDebug(),
    }
  }

  const res = event.node.res as ServerResponse
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('X-Zectrix-Pushed', String(!noPush))
  res.setHeader('Content-Length', buffer.length)
  res.end(buffer)
})
