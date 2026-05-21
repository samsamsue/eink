/// <reference path="../../types/lunar-javascript.d.ts" />
/// <reference path="../../types/opentype-js.d.ts" />

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { CanvasRenderingContext2D } from 'canvas'
import type { ServerResponse } from 'http'
import opentype from 'opentype.js'
import { Solar } from 'lunar-javascript'

const DESIGN_WIDTH = 800
const DESIGN_HEIGHT = 600
const SCALE = 0.5
const WIDTH = DESIGN_WIDTH * SCALE
const HEIGHT = DESIGN_HEIGHT * SCALE
const FONT_FAMILY = 'sans-serif'
const fontPath = [
  join(process.cwd(), 'public/fonts/DroidSansFallbackFull.ttf'),
  join(process.cwd(), '.output/public/fonts/DroidSansFallbackFull.ttf'),
  '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
].find((candidate) => existsSync(candidate))
const fontBuffer = fontPath ? readFileSync(fontPath) : null
const pathFont = fontBuffer
  ? opentype.parse(fontBuffer.buffer.slice(
      fontBuffer.byteOffset,
      fontBuffer.byteOffset + fontBuffer.byteLength,
    ))
  : null

let canvasModulePromise: Promise<typeof import('canvas')> | null = null

const getCanvasModule = async () => {
  canvasModulePromise ||= import('canvas')
  return canvasModulePromise
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

    const hotList = bandList
      .filter((item: WeiboHotBandItem) => !item.ad_channel && item.word)
      .slice(0, 6)
      .map((item: WeiboHotBandItem) => ({
        tag: item.label_name || '新',
        title: item.word || '',
      }))

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
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: number | 'bold' | 'normal' = 'bold',
) => {
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`
}

const getFontSize = (ctx: CanvasRenderingContext2D) => (
  Number(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16)
)

const shouldDrawWithPath = (char: string) => /[\p{Script=Han}，。、：；！？（）《》“”‘’]/u.test(char)

const measureDisplayText = (
  ctx: CanvasRenderingContext2D,
  text: string,
) => {
  const size = getFontSize(ctx)

  return Array.from(text).reduce((width, char) => (
    width + (pathFont && shouldDrawWithPath(char)
      ? pathFont.getAdvanceWidth(char, size)
      : ctx.measureText(char).width)
  ), 0)
}

const drawBoldText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  _strokeWidth = 0,
) => {
  const size = getFontSize(ctx)
  const measuredWidth = measureDisplayText(ctx, text)
  const drawX = ctx.textAlign === 'right'
    ? x - measuredWidth
    : ctx.textAlign === 'center'
      ? x - measuredWidth / 2
      : x
  const drawY = ctx.textBaseline === 'middle' ? y + size * 0.36 : y
  const originalTextAlign = ctx.textAlign
  let cursorX = drawX

  ctx.textAlign = 'left'

  for (const char of Array.from(text)) {
    if (pathFont && shouldDrawWithPath(char)) {
      const path = pathFont.getPath(char, cursorX, drawY, size)

      path.fill = String(ctx.fillStyle)
      path.draw(ctx)
      cursorX += pathFont.getAdvanceWidth(char, size)
    } else {
      ctx.fillText(char, cursorX, y)
      cursorX += ctx.measureText(char).width
    }
  }

  ctx.textAlign = originalTextAlign
}

const ellipsizeText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) => {
  const measureText = (value: string) => measureDisplayText(ctx, value)

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

  ctx.drawImage(image, 10, 12, 101, 101)
}

const drawAlmanac = (
  ctx: CanvasRenderingContext2D,
  almanac: AlmanacPayload,
) => {
  ctx.save()

  ctx.strokeStyle = '#aaa'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(238, 19)
  ctx.lineTo(238, 103)
  ctx.moveTo(540, 19)
  ctx.lineTo(540, 103)
  ctx.stroke()

  ctx.fillStyle = '#000'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  setFont(ctx, 24, 'bold')
  drawBoldText(ctx, ellipsizeText(ctx, `宜：${almanac.yi.join('、')}`, 262), 260, 48)
  drawBoldText(ctx, ellipsizeText(ctx, `忌：${almanac.ji.join('、')}`, 262), 260, 83)

  ctx.restore()
}

const drawMessageIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.save()
  ctx.fillStyle = '#fff'
  roundRect(ctx, x, y, 48, 36, 5)
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(x + 17, y + 34)
  ctx.lineTo(x + 10, y + 48)
  ctx.lineTo(x + 28, y + 36)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#000'
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(x + 15 + i * 11, y + 17, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

const drawHotItem = (
  ctx: CanvasRenderingContext2D,
  centerY: number,
  tag: string,
  title: string,
) => {
  ctx.fillStyle = '#000'
  roundRect(ctx, 26, centerY - 18.5, 37, 37, 9)
  ctx.fill()

  ctx.fillStyle = '#fff'
  setFont(ctx, 27, 'bold')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  drawBoldText(ctx, tag, 44.5, centerY)

  ctx.fillStyle = '#000'
  setFont(ctx, 30, 'bold')
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  drawBoldText(ctx, title, 77, centerY)
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const env = useRuntimeConfig()

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
  const pushOptions = {
    dither: typeof query.dither === 'string' ? query.dither : undefined,
    pageId: typeof query.pageId === 'string' ? query.pageId : undefined,
  }
  const [weather, hotList, todoTip] = await Promise.all([
    fetchWeather(location),
    fetchHotList(),
    fetchTodoTip(),
  ])
  const { createCanvas } = await getCanvasModule()
  const realtimeDate = getRealtimeDate()
  const nextObservance = getNextObservance()
  const almanac = getRealtimeAlmanac()

  const canvas = createCanvas(WIDTH, HEIGHT)
  const ctx = canvas.getContext('2d')

  ctx.antialias = 'gray'
  ctx.scale(SCALE, SCALE)
  ctx.fillStyle = '#f4f4f4'
  ctx.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT)

  // Header.
  await drawWeatherIcon(ctx, weather)

  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  setFont(ctx, 42, 'bold')
  drawBoldText(ctx, `${weather.temperature}°C`, 128, 58)
  setFont(ctx, 33, 'bold')
  drawBoldText(ctx, weather.text, 128, 99)

  drawAlmanac(ctx, almanac)

  ctx.textAlign = 'right'
  setFont(ctx, 37, 'bold')
  drawBoldText(ctx, realtimeDate.date, 780, 56)
  setFont(ctx, 31, 'bold')
  drawBoldText(ctx, `${realtimeDate.weekday}  ${realtimeDate.lunar}`, 781, 98)

  ctx.strokeStyle = '#000'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 121)
  ctx.lineTo(DESIGN_WIDTH, 121)
  ctx.stroke()

  // News list.
  ctx.textAlign = 'left'
  hotList.forEach((item, index) => {
    drawHotItem(ctx, 178 + index * 56, item.tag, item.title)
  })

  // Footer.
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(0, 506)
  ctx.lineTo(DESIGN_WIDTH, 506)
  ctx.stroke()

  ctx.fillStyle = '#000'
  setFont(ctx, 42, 'bold')
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  drawBoldText(ctx, nextObservance, 16, 553)

  if (todoTip) {
    roundRect(ctx, 326, 521, 458, 63, 15)
    ctx.fill()

    drawMessageIcon(ctx, 344, 529)

    ctx.fillStyle = '#fff'
    setFont(ctx, 31, 'bold')
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    drawBoldText(ctx, ellipsizeText(ctx, todoTip, 360), 405, 552.5)
  }

  const buffer = canvas.toBuffer('image/png')
  await pushImageToDevice(buffer, pushOptions)

  if (!preview) {
    return {
      completed: true,
      pushed: true,
    }
  }

  const res = event.node.res as ServerResponse
  res.setHeader('Content-Type', 'image/png')
  res.setHeader('X-Zectrix-Pushed', 'true')
  res.setHeader('Content-Length', buffer.length)
  res.end(buffer)
})
