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
const GRAPHICS_MONO_THRESHOLD = 50
const UNIFONT_OTF_ASSET_KEY = 'server:fonts/unifont.otf'
const UNIFONT_BDF_ASSET_KEY = 'server:fonts/unifont.bdf'
const s = (value: number) => Math.round(value * RENDER_SCALE)
const snap = (value: number) => Math.round(value)

type LoadedFont = {
  bytes: Uint8Array
  family: string
  path: string
}

type BdfGlyph = {
  dwidth: number
  bbxWidth: number
  bbxHeight: number
  bbxOffsetX: number
  bbxOffsetY: number
  rowBytes: number
  bytes: Uint8Array
}

type GlyphMetrics = {
  advance: number
  leftTrim: number
}

type GlyphSpacingMode = 'default' | 'tight' | 'ultraTight'

type BitmapFont = {
  width: number
  height: number
  ascent: number
  baselineOffset: number
  rowBytes: number
  glyphs?: Map<string, BdfGlyph>
  glyphCache?: Map<string, Uint8Array>
}

type BitmapFontState = {
  font10: BitmapFont
  font12: BitmapFont
  font16: BitmapFont
}

type FontState = {
  bitmap: BitmapFontState
  cjk: LoadedFont
  latin: LoadedFont
  fontStack: string
}

let fontStatePromise: Promise<FontState> | null = null

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

const parseBdfGlyphs = (text: string) => {
  const glyphs = new Map<string, BdfGlyph>()
  const lines = text.split(/\r?\n/)

  let encoding: number | null = null
  let dwidth = 0
  let bbxWidth = 0
  let bbxHeight = 0
  let bbxOffsetX = 0
  let bbxOffsetY = 0
  let bitmapRows: string[] = []
  let inBitmap = false

  const flushGlyph = () => {
    if (encoding == null || encoding < 0 || bbxWidth <= 0 || bbxHeight <= 0) {
      encoding = null
      dwidth = 0
      bbxWidth = 0
      bbxHeight = 0
      bbxOffsetX = 0
      bbxOffsetY = 0
      bitmapRows = []
      inBitmap = false
      return
    }

    const rowBytes = Math.max(1, Math.ceil(bbxWidth / 8))
    const bytes = new Uint8Array(rowBytes * bbxHeight)

    for (let row = 0; row < Math.min(bitmapRows.length, bbxHeight); row++) {
      const hex = bitmapRows[row].trim().padStart(rowBytes * 2, '0')

      for (let byteIndex = 0; byteIndex < rowBytes; byteIndex++) {
        const value = Number.parseInt(hex.slice(byteIndex * 2, byteIndex * 2 + 2), 16)
        bytes[row * rowBytes + byteIndex] = Number.isFinite(value) ? value : 0
      }
    }

    glyphs.set(String.fromCodePoint(encoding), {
      dwidth,
      bbxWidth,
      bbxHeight,
      bbxOffsetX,
      bbxOffsetY,
      rowBytes,
      bytes,
    })

    encoding = null
    dwidth = 0
    bbxWidth = 0
    bbxHeight = 0
    bbxOffsetX = 0
    bbxOffsetY = 0
    bitmapRows = []
    inBitmap = false
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (line.startsWith('STARTCHAR ')) {
      encoding = null
      dwidth = 0
      bbxWidth = 0
      bbxHeight = 0
      bbxOffsetX = 0
      bbxOffsetY = 0
      bitmapRows = []
      inBitmap = false
      continue
    }

    if (line === 'ENDCHAR') {
      flushGlyph()
      continue
    }

    if (line === 'BITMAP') {
      inBitmap = true
      continue
    }

    if (inBitmap) {
      bitmapRows.push(line)
      continue
    }

    if (line.startsWith('ENCODING ')) {
      encoding = Number.parseInt(line.slice(9), 10)
      continue
    }

    if (line.startsWith('DWIDTH ')) {
      dwidth = Number.parseInt(line.slice(7).split(/\s+/)[0] || '0', 10) || 0
      continue
    }

    if (line.startsWith('BBX ')) {
      const [width, height, offsetX, offsetY] = line.slice(4).split(/\s+/).map((value) => Number.parseInt(value, 10) || 0)
      bbxWidth = width
      bbxHeight = height
      bbxOffsetX = offsetX
      bbxOffsetY = offsetY
    }
  }

  return glyphs
}

const loadFonts = async (): Promise<FontState> => {
  if (!fontStatePromise) {
    fontStatePromise = (async () => {
      const { registerFont } = await getCanvasModule()
      const cjkFamily = 'EinkCJK-Unifont'
      const latinFamily = 'EinkLatin-Unifont'
      const [
        cjkFontBytes,
        latinFontBytes,
        unifontBdfText,
      ] = await Promise.all([
        readFontAsset(UNIFONT_OTF_ASSET_KEY),
        readFontAsset(UNIFONT_OTF_ASSET_KEY),
        readTextAsset(UNIFONT_BDF_ASSET_KEY),
      ])
      const fontCacheDir = await getFontCacheDir()
      const cjkFontPath = join(fontCacheDir, 'unifont.otf')
      const latinFontPath = join(fontCacheDir, 'unifont-latin.otf')
      const unifontGlyphs = parseBdfGlyphs(unifontBdfText || '')

      await Promise.all([
        writeFile(cjkFontPath, cjkFontBytes),
        writeFile(latinFontPath, latinFontBytes),
      ])

      registerFont(cjkFontPath, { family: cjkFamily })
      registerFont(latinFontPath, { family: latinFamily })

      return {
        bitmap: {
          font10: {
            width: 16,
            height: 16,
            ascent: 14,
            baselineOffset: 0,
            rowBytes: 2,
            glyphs: unifontGlyphs,
          },
          font12: {
            width: 16,
            height: 16,
            ascent: 14,
            baselineOffset: 0,
            rowBytes: 2,
            glyphs: unifontGlyphs,
          },
          font16: {
            width: 16,
            height: 16,
            ascent: 14,
            baselineOffset: 0,
            rowBytes: 2,
            glyphs: unifontGlyphs,
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
      }
    })().catch((error) => {
      fontStatePromise = null
      throw error
    })
  }

  return fontStatePromise
}

let canvasModulePromise: Promise<typeof import('canvas')> | null = null
let loadedCanvasModule: typeof import('canvas') | null = null

const getCanvasModule = async () => {
  canvasModulePromise ||= import('canvas').then((module) => {
    loadedCanvasModule = module
    return module
  })
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
      yi: lunar.getDayYi(),
      ji: lunar.getDayJi(),
    }
  } catch {
    return defaultAlmanac
  }
}

const balanceAlmanacItems = (almanac: AlmanacPayload): AlmanacPayload => {
  const maxTotal = 10
  const baseLimit = Math.floor(maxTotal / 2)
  const yiBaseCount = Math.min(almanac.yi.length, baseLimit)
  const jiBaseCount = Math.min(almanac.ji.length, baseLimit)
  const spareCount = maxTotal - yiBaseCount - jiBaseCount
  const yiExtraCapacity = Math.max(0, almanac.yi.length - yiBaseCount)
  const jiExtraCapacity = Math.max(0, almanac.ji.length - jiBaseCount)
  const yiExtraCount = Math.min(yiExtraCapacity, spareCount)
  const jiExtraCount = Math.min(jiExtraCapacity, spareCount - yiExtraCount)

  return {
    yi: almanac.yi.slice(0, yiBaseCount + yiExtraCount),
    ji: almanac.ji.slice(0, jiBaseCount + jiExtraCount),
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

  if (normalizedText.includes('雷') || codeNumber === 11 || codeNumber === 12) {
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

    const topFixed = normalizedList.slice(0, 3)
    const remaining = normalizedList.slice(3)

    for (let index = remaining.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1))
      const current = remaining[index]
      remaining[index] = remaining[randomIndex]
      remaining[randomIndex] = current
    }

    const hotList = [...topFixed, ...remaining.slice(0, 5)].slice(0, 8)

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
  const scale = ((ctx.canvas as unknown as { width: number }).width / WIDTH) || 1
  ctx.font = `${weight} ${s(size) * scale}px ${fonts.fontStack}`
}

const getFontSize = (ctx: CanvasRenderingContext2D) => (
  Number(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16)
)

const rasterizeBitmapGlyphSync = (
  fonts: FontState,
  char: string,
  bitmapFont: BitmapFont,
) => {
  const bdfGlyph = bitmapFont.glyphs?.get(char)

  if (bdfGlyph) {
    return bdfGlyph.bytes
  }

  const cached = bitmapFont.glyphCache?.get(char)

  if (cached) {
    return cached
  }

  if (!loadedCanvasModule) {
    throw new Error('Canvas module not loaded before glyph rasterization')
  }

  const { createCanvas } = loadedCanvasModule
  const canvas = createCanvas(bitmapFont.width, bitmapFont.height)
  const ctx = canvas.getContext('2d')
  ctx.antialias = 'none'
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, bitmapFont.width, bitmapFont.height)
  ctx.fillStyle = '#000'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `normal ${bitmapFont.height}px ${fonts.fontStack}`
  ctx.fillText(char, 0, bitmapFont.ascent)

  const imageData = ctx.getImageData(0, 0, bitmapFont.width, bitmapFont.height)
  const glyphBytes = new Uint8Array(bitmapFont.rowBytes * bitmapFont.height)

  for (let row = 0; row < bitmapFont.height; row++) {
    for (let col = 0; col < bitmapFont.width; col++) {
      const pixelIndex = (row * bitmapFont.width + col) * 4
      const alpha = imageData.data[pixelIndex + 3]

      if (alpha < 96) {
        continue
      }

      const byteIndex = row * bitmapFont.rowBytes + Math.floor(col / 8)
      glyphBytes[byteIndex] |= 0x80 >> (col % 8)
    }
  }

  bitmapFont.glyphCache?.set(char, glyphBytes)
  return glyphBytes
}

const getBitmapGlyph = (
  fonts: FontState,
  char: string,
  size: number,
) => {
  const bitmapFont = size <= 10
    ? fonts.bitmap.font10
    : size <= 13
      ? fonts.bitmap.font12
      : fonts.bitmap.font16

  if (bitmapFont.glyphs?.has(char)) {
    return {
      char,
      bitmapFont,
    }
  }

  return null
}

const getBitmapGlyphBytes = (
  fonts: FontState,
  glyph: NonNullable<ReturnType<typeof getBitmapGlyph>>,
) => {
  const { bitmapFont } = glyph

  return rasterizeBitmapGlyphSync(fonts, glyph.char, bitmapFont)
}

const getBitmapGlyphAdvance = (
  fonts: FontState,
  glyph: NonNullable<ReturnType<typeof getBitmapGlyph>>,
  spacingMode: GlyphSpacingMode = 'default',
): GlyphMetrics => {
  const { bitmapFont } = glyph
  const bdfGlyph = bitmapFont.glyphs?.get(glyph.char)

  if (bdfGlyph) {
    const spacing = spacingMode === 'ultraTight'
      ? -2
      : spacingMode === 'tight'
        ? 0
        : bitmapFont.width <= 10 ? 0 : 1

    return {
      advance: Math.max(1, (bdfGlyph.dwidth || bdfGlyph.bbxWidth) + spacing),
      leftTrim: Math.max(0, -bdfGlyph.bbxOffsetX),
    }
  }

  const glyphBytes = getBitmapGlyphBytes(fonts, glyph)
  let leftmostPixel = bitmapFont.width
  let rightmostPixel = -1

  for (let row = 0; row < bitmapFont.height; row++) {
    for (let byteIndex = 0; byteIndex < bitmapFont.rowBytes; byteIndex++) {
      const value = glyphBytes[row * bitmapFont.rowBytes + byteIndex]

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
  spacingMode: GlyphSpacingMode = 'default',
) => Array.from(text).reduce((width, char) => {
  const glyph = getBitmapGlyph(fonts, char, size)

  if (glyph) {
    return width + getBitmapGlyphAdvance(fonts, glyph, spacingMode).advance
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
  spacingMode: GlyphSpacingMode = 'default',
) => {
  const measuredWidth = measureMixedText(fonts, ctx, text, size, spacingMode)

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

    const { bitmapFont } = glyph
    const bdfGlyph = bitmapFont.glyphs?.get(glyph.char)
    const metrics = getBitmapGlyphAdvance(fonts, glyph, spacingMode)
    const glyphBytes = getBitmapGlyphBytes(fonts, glyph)
    const glyphWidth = bdfGlyph?.bbxWidth ?? bitmapFont.width
    const glyphHeight = bdfGlyph?.bbxHeight ?? bitmapFont.height
    const glyphRowBytes = bdfGlyph?.rowBytes ?? bitmapFont.rowBytes
    const fontBoxTopY = originalTextBaseline === 'middle'
      ? snap(y - bitmapFont.height / 2 + bitmapFont.baselineOffset)
      : snap(y - bitmapFont.ascent + bitmapFont.baselineOffset)
    const topY = bdfGlyph
      ? snap(fontBoxTopY + bitmapFont.ascent - glyphHeight - bdfGlyph.bbxOffsetY)
      : originalTextBaseline === 'middle'
        ? snap(y - bitmapFont.height / 2 + bitmapFont.baselineOffset)
        : snap(y - bitmapFont.ascent + bitmapFont.baselineOffset)
    const leftX = bdfGlyph ? cursorX + Math.max(0, bdfGlyph.bbxOffsetX) : cursorX

    for (let row = 0; row < glyphHeight; row++) {
      for (let byteIndex = 0; byteIndex < glyphRowBytes; byteIndex++) {
        const value = glyphBytes[row * glyphRowBytes + byteIndex]

        for (let bit = 0; bit < 8; bit++) {
          if ((value & (0x80 >> bit)) === 0) {
            continue
          }

          const glyphPixelX = byteIndex * 8 + bit
          const px = leftX + glyphPixelX - metrics.leftTrim

          if (glyphPixelX >= glyphWidth || px < cursorX || px >= cursorX + Math.max(bitmapFont.width, metrics.advance, glyphWidth)) {
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

const measureDisplayText = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  text: string,
  spacingMode: GlyphSpacingMode = 'default',
) => {
  const size = getFontSize(ctx)
  return measureMixedText(fonts, ctx, text, size, spacingMode)
}

const drawBoldText = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  _strokeWidth = 0,
  spacingMode: GlyphSpacingMode = 'default',
) => {
  const size = getFontSize(ctx)
  if (drawBitmapText(fonts, ctx, text, x, y, size, spacingMode)) {
    return
  }

  const measuredWidth = measureDisplayText(fonts, ctx, text, spacingMode)
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
  spacingMode: GlyphSpacingMode = 'default',
  marker = '...',
) => {
  const measureText = (value: string) => measureDisplayText(fonts, ctx, value, spacingMode)

  if (measureText(text) <= maxWidth) {
    return text
  }

  const chars = Array.from(text)
  let output = chars.join('')

  while (chars.length > 0 && measureText(`${output}${marker}`) > maxWidth) {
    chars.pop()
    output = chars.join('')
  }

  return output && measureText(`${output}${marker}`) <= maxWidth ? `${output}${marker}` : ''
}

const drawDistributedAlmanacLine = (
  fonts: FontState,
  ctx: CanvasRenderingContext2D,
  label: '宜' | '忌',
  values: string[],
  x: number,
  y: number,
  maxWidth: number,
) => {
  const visibleValues = values
  const spacingMode: GlyphSpacingMode = 'ultraTight'
  const labelText = `${label}：`
  setFont(fonts, ctx, 32, 'normal')

  const labelWidth = measureDisplayText(fonts, ctx, labelText)
  const contentX = x + labelWidth
  const contentWidth = Math.max(0, maxWidth - labelWidth)
  const wideGap = s(12)
  const tightGap = s(6)
  const totalValueWidth = visibleValues.reduce((sum, value) => sum + measureDisplayText(fonts, ctx, value, spacingMode), 0)
  const wideTotalWidth = totalValueWidth + wideGap * Math.max(0, visibleValues.length - 1)
  const gap = wideTotalWidth <= contentWidth ? wideGap : tightGap
  let cursorX = contentX

  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  drawBoldText(fonts, ctx, labelText, x, y)

  visibleValues.forEach((value, index) => {
    const remainingValues = visibleValues.length - index - 1
    const remainingGapWidth = gap * remainingValues
    const maxValueWidth = Math.max(0, x + maxWidth - cursorX - remainingGapWidth)
    const text = ellipsizeText(fonts, ctx, value, maxValueWidth, spacingMode)

    if (!text) {
      return
    }

    drawBoldText(fonts, ctx, text, cursorX, y, 0, spacingMode)

    cursorX += measureDisplayText(fonts, ctx, text, spacingMode) + gap
  })
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
  color = '#000',
) => {
  const { loadImage } = await getCanvasModule()
  const iconName = getWeatherIconName(weather.code, weather.text)
  const paths = weatherIconPaths[iconName].join('')
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="-2 -2 28 28"',
    ` fill="none" stroke="${color}" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round">`,
    paths,
    '</svg>',
  ].join('')
  const image = await loadImage(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)

  ctx.drawImage(image, s(6), s(8), s(86), s(86))
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

const drawHotItemBadge = (
  ctx: CanvasRenderingContext2D,
  x: number,
  centerY: number,
) => {
  ctx.fillStyle = '#000'
  roundRect(ctx, x, centerY - s(22), s(44), s(44), s(11))
  ctx.fill()
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

const parseRenderDate = (value: unknown) => {
  if (typeof value !== 'string') {
    return new Date()
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (!match) {
    return new Date()
  }

  const [, year, month, day] = match
  const parsedDate = new Date(`${year}-${month}-${day}T00:00:00+08:00`)

  return Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const env = useRuntimeConfig()
  const graphicsThreshold = typeof query.graphicsThreshold === 'string'
    ? Math.max(0, Math.min(255, Number(query.graphicsThreshold) || GRAPHICS_MONO_THRESHOLD))
    : GRAPHICS_MONO_THRESHOLD

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

  const renderDate = parseRenderDate(query.date)
  const realtimeDate = getRealtimeDate(renderDate)
  const nextObservance = getNextObservance(renderDate)
  const almanac = getRealtimeAlmanac(renderDate)
  const balancedAlmanac = balanceAlmanacItems(almanac)
  const outerX = s(12)
  const outerRight = WIDTH - s(12)
  const headerBottom = s(94)
  const sideLeft = s(606)
  const footerTop = s(536)

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

  // Header.
  await drawWeatherIcon(graphicsCtx, weather)

  textCtx.fillStyle = '#000'
  textCtx.textBaseline = 'middle'
  textCtx.textAlign = 'left'
  setFont(fonts, textCtx, 32, 'normal')
  drawBoldText(fonts, textCtx, `${weather.temperature}°C ${weather.text}`, s(112), s(48))

  if (todoTip) {
    const bubbleRight = outerRight
    const bubbleY = s(14)
    const bubbleHeight = s(60)
    const bubbleRadius = s(10)
    const bubbleMaxWidth = s(438)
    const bubbleMinWidth = s(170)
    const bubblePaddingLeft = s(14)
    const bubblePaddingRight = s(16)
    const iconWidth = s(48)
    const iconGap = s(10)
    const textMaxWidth = bubbleMaxWidth - bubblePaddingLeft - iconWidth - iconGap - bubblePaddingRight

    textCtx.fillStyle = '#000'
    setFont(fonts, textCtx, 32, 'normal')
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
    drawMessageIcon(graphicsCtx, iconX, bubbleY + s(12))

    textCtx.fillStyle = '#fff'
    setFont(fonts, textCtx, 32, 'normal')
    textCtx.textAlign = 'left'
    textCtx.textBaseline = 'middle'
    drawBoldText(fonts, textCtx, todoText, textX, bubbleY + Math.floor(bubbleHeight / 2))
  }

  graphicsCtx.fillStyle = '#000'
  graphicsCtx.fillRect(0, headerBottom, WIDTH, 1)
  graphicsCtx.fillRect(sideLeft, headerBottom, 1, footerTop - headerBottom + 1)

  // News list.
  const newsTop = s(134)
  const newsBottom = s(498)
  const newsRows = 8
  const newsRowGap = (newsBottom - newsTop) / (newsRows - 1)
  const newsMarginX = outerX
  const newsBadgeWidth = s(44)
  const newsTextGap = s(10)
  const newsFontSize = 32
  const newsTagFontSize = 32
  textCtx.textAlign = 'left'
  hotList.slice(0, newsRows).forEach((item, index) => {
    const itemX = newsMarginX
    const centerY = snap(newsTop + index * newsRowGap)
    const titleX = itemX + newsBadgeWidth + newsTextGap
    const titleMaxWidth = sideLeft - titleX - s(14)

    drawHotItemBadge(graphicsCtx, itemX, centerY)

    textCtx.fillStyle = '#fff'
    setFont(fonts, textCtx, newsTagFontSize, 'normal')
    textCtx.textAlign = 'center'
    textCtx.textBaseline = 'middle'
    drawBoldText(fonts, textCtx, Array.from(item.tag)[0] || '', itemX + Math.floor(newsBadgeWidth / 2), centerY)

    textCtx.fillStyle = '#000'
    setFont(fonts, textCtx, newsFontSize, 'normal')
    textCtx.textAlign = 'left'
    textCtx.textBaseline = 'middle'
    drawBoldText(fonts, textCtx, ellipsizeText(fonts, textCtx, item.title, titleMaxWidth, 'tight', '…'), titleX, centerY, 0, 'tight')
  })

  // Right date panel.
  const sideX = sideLeft + s(18)
  const sideRight = outerRight
  textCtx.fillStyle = '#000'
  textCtx.textAlign = 'left'
  textCtx.textBaseline = 'middle'
  setFont(fonts, textCtx, 32, 'normal')
  drawBoldText(fonts, textCtx, realtimeDate.date, sideX, s(164))

  const weekdayBadgeX = sideX
  const weekdayBadgeY = s(196)
  const weekdayBadgeWidth = s(116)
  const weekdayBadgeHeight = s(40)
  graphicsCtx.fillStyle = '#000'
  roundRect(graphicsCtx, weekdayBadgeX, weekdayBadgeY, weekdayBadgeWidth, weekdayBadgeHeight, s(6))
  graphicsCtx.fill()
  textCtx.fillStyle = '#fff'
  setFont(fonts, textCtx, 32, 'normal')
  textCtx.textAlign = 'center'
  drawBoldText(fonts, textCtx, realtimeDate.weekday, weekdayBadgeX + Math.floor(weekdayBadgeWidth / 2), weekdayBadgeY + Math.floor(weekdayBadgeHeight / 2))

  textCtx.fillStyle = '#000'
  textCtx.textAlign = 'left'
  setFont(fonts, textCtx, 32, 'normal')
  drawBoldText(fonts, textCtx, realtimeDate.lunar, sideX, s(272))

  const todayEventName = nextObservance.replace(/^\d+天后/, '')
  const isTodayEvent = Boolean(nextObservance && todayEventName === nextObservance)

  if (nextObservance) {
    const eventText = isTodayEvent ? todayEventName : todayEventName
    const eventPrefix = isTodayEvent ? '今天是：' : nextObservance.replace(todayEventName, '')
    setFont(fonts, textCtx, 32, 'normal')
    drawBoldText(fonts, textCtx, eventPrefix, sideX, s(386))

    if (isTodayEvent) {
      const eventPaddingX = s(10)
      const eventBadgeX = sideX
      const eventBadgeY = s(410)
      const eventBadgeHeight = s(42)
      const eventBadgeWidth = Math.min(sideRight - eventBadgeX, Math.ceil(measureDisplayText(fonts, textCtx, eventText)) + eventPaddingX * 2)

      graphicsCtx.fillStyle = '#000'
      roundRect(graphicsCtx, eventBadgeX, eventBadgeY, eventBadgeWidth, eventBadgeHeight, s(7))
      graphicsCtx.fill()

      textCtx.fillStyle = '#fff'
      textCtx.textAlign = 'center'
      drawBoldText(fonts, textCtx, eventText, eventBadgeX + Math.floor(eventBadgeWidth / 2), eventBadgeY + Math.floor(eventBadgeHeight / 2))
    } else {
      textCtx.fillStyle = '#000'
      textCtx.textAlign = 'left'
      drawBoldText(fonts, textCtx, ellipsizeText(fonts, textCtx, eventText, sideRight - sideX), sideX, s(430))
    }
  }

  // Footer almanac.
  graphicsCtx.fillStyle = '#000'
  graphicsCtx.fillRect(0, footerTop, WIDTH, 1)

  textCtx.fillStyle = '#000'
  textCtx.textAlign = 'left'
  textCtx.textBaseline = 'middle'
  drawDistributedAlmanacLine(fonts, textCtx, '宜', balancedAlmanac.yi, outerX, s(570), Math.floor((outerRight - outerX) / 2))
  drawDistributedAlmanacLine(fonts, textCtx, '忌', balancedAlmanac.ji, s(408), s(570), outerRight - s(408))

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
    }
  }

  const res = event.node.res as ServerResponse
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('X-Zectrix-Pushed', String(!noPush))
  res.setHeader('Content-Length', buffer.length)
  res.end(buffer)
})
