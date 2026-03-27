import {
  countRawCourses,
  createUpcomingCourseFilterOptions,
  extractNormalizedCourses,
  extractRequestContext,
  fetchCoursePayload
} from "./lib/course-data.js";
import { formatRange } from "./lib/date.js";
import type { CourseRequestContext, NormalizedCourse } from "./lib/types.js";

type StatusTone = "neutral" | "success" | "error";

interface StatusMessage {
  tone: StatusTone;
  text: string;
}

interface AppState {
  request: CourseRequestContext | null;
  payload: unknown;
  courses: NormalizedCourse[];
  rawCourseCount: number;
  fetchedAt: string | null;
}

interface LoadedPayloadInput {
  payload: unknown;
  sourceUrl?: string;
  request?: Partial<CourseRequestContext>;
  showCourseDays?: number | null;
  fetchedAt?: string;
}

interface CreateSubscriptionResponse {
  subscriptionUrl: string;
}

const DEFAULT_CALENDAR_NAME = "Miley's English Club 课程日历订阅";
const LEGACY_SOURCE_URL_STORAGE_KEY = "wechat-course-calendar-sync:source-url";

const STORAGE_KEYS = {
  calendarName: "wechat-course-calendar-sync:calendar-name"
} as const;

const state: AppState = {
  request: null,
  payload: null,
  courses: [],
  rawCourseCount: 0,
  fetchedAt: null
};

const sourceUrlInput = getElement<HTMLInputElement>("#source-url");
const calendarNameInput = getElement<HTMLInputElement>("#calendar-name");
const subscriptionUrlInput = getElement<HTMLInputElement>("#subscription-url");
const subscriptionNote = getElement<HTMLElement>("#subscription-note");
const stats = getElement<HTMLElement>("#course-stats");
const courseList = getElement<HTMLElement>("#course-list");
const coursesLayout = getElement<HTMLElement>("#courses-layout");
const coursePanelHint = getElement<HTMLElement>("#course-panel-hint");
const requestStatusBanner = getElement<HTMLElement>("#request-status-banner");
const toastStack = getElement<HTMLElement>("#toast-stack");
const parseButton = getElement<HTMLButtonElement>("#parse-url");
const directFetchButton = getElement<HTMLButtonElement>("#direct-fetch");
const fetchMenu = getElement<HTMLElement>("#fetch-menu");
const fetchMenuTrigger = getElement<HTMLButtonElement>("#fetch-menu-trigger");
const fetchMenuPanel = getElement<HTMLElement>("#fetch-menu-panel");
const fetchPanel = fetchMenu.closest(".panel");
const copySubscriptionButton = getElement<HTMLButtonElement>("#copy-subscription");
const copySubscriptionIconButton = getElement<HTMLButtonElement>("#copy-subscription-icon");
let subscriptionRequestSerial = 0;
let requestStatus: StatusMessage | null = null;

bootstrap();

function bootstrap(): void {
  hydrateInputs();
  bindEvents();
  closeFetchMenu();
  restoreRequestState();
  void refreshSubscriptionUrl();
  syncActionButtons();
  renderRequestStatus();
  renderStats();
  renderCourses();
}

function hydrateInputs(): void {
  const storedCalendarName = localStorage.getItem(STORAGE_KEYS.calendarName) ?? DEFAULT_CALENDAR_NAME;

  sourceUrlInput.value = "";
  localStorage.removeItem(LEGACY_SOURCE_URL_STORAGE_KEY);
  calendarNameInput.value =
    !storedCalendarName ||
    storedCalendarName === "微信约课同步" ||
    storedCalendarName === "Miley's English Club 课程时间订阅"
      ? DEFAULT_CALENDAR_NAME
      : storedCalendarName;
}

function bindEvents(): void {
  sourceUrlInput.addEventListener("change", () => {
    clearRequestStatus();
    void refreshSubscriptionUrl();
  });

  calendarNameInput.addEventListener("change", () => {
    localStorage.setItem(STORAGE_KEYS.calendarName, calendarNameInput.value.trim());
    void refreshSubscriptionUrl();
  });

  fetchMenuTrigger.addEventListener("click", (event) => {
    event.stopPropagation();
    setFetchMenuOpen(fetchMenuPanel.hidden);
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Node) || fetchMenu.contains(event.target)) {
      return;
    }

    closeFetchMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeFetchMenu();
    }
  });

  parseButton.addEventListener("click", () => {
    closeFetchMenu();

    try {
      state.request = parseCurrentRequest();
      setRequestStatus("success", "链接检查通过，可以开始读取课程。");
      void refreshSubscriptionUrl();
    } catch (error) {
      setRequestStatus("error", toErrorMessage(error));
    }
  });

  directFetchButton.addEventListener("click", async () => {
    closeFetchMenu();
    fetchMenuTrigger.disabled = true;

    try {
      await withBusy(directFetchButton, async () => {
        let request: CourseRequestContext;

        try {
          request = parseCurrentRequest();
        } catch (error) {
          setRequestStatus("error", toErrorMessage(error));
          return;
        }

        state.request = request;
        void refreshSubscriptionUrl();

        try {
          const result = await fetchCoursePayload(request);
          applyLoadedPayload({
            payload: result.payload,
            sourceUrl: request.sourceUrl,
            request: { ...request, startDay: result.startDay },
            showCourseDays: result.showCourseDays,
            fetchedAt: new Date().toISOString()
          });
          clearRequestStatus();
        } catch (error) {
          setRequestStatus("error", toErrorMessage(error));
        }
      });
    } finally {
      fetchMenuTrigger.disabled = false;
    }
  });

  copySubscriptionButton.addEventListener("click", async () => {
    await copySubscriptionUrl();
  });

  copySubscriptionIconButton.addEventListener("click", async () => {
    await copySubscriptionUrl();
  });

  subscriptionUrlInput.addEventListener("click", async () => {
    await copySubscriptionUrl();
  });

  subscriptionUrlInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    await copySubscriptionUrl();
  });
}

function restoreRequestState(): void {
  if (!sourceUrlInput.value.trim()) {
    return;
  }

  try {
    state.request = parseCurrentRequest();
  } catch {
    state.request = null;
  }
}

function applyLoadedPayload(input: LoadedPayloadInput): void {
  state.payload = input.payload;
  state.courses = extractNormalizedCourses(input.payload, createUpcomingCourseFilterOptions(input.showCourseDays));
  state.rawCourseCount = countRawCourses(input.payload);
  state.fetchedAt = input.fetchedAt ?? new Date().toISOString();

  if (input.sourceUrl) {
    sourceUrlInput.value = input.sourceUrl;
  }

  state.request =
    input.request && isCompleteRequest(input.request)
      ? input.request
      : input.sourceUrl
        ? tryExtractRequest(input.sourceUrl)
        : state.request;

  void refreshSubscriptionUrl();
  renderStats();
  renderCourses();
}

function parseCurrentRequest(): CourseRequestContext {
  const sourceUrl = sourceUrlInput.value.trim();

  if (!sourceUrl) {
    throw new Error("请先粘贴微信约课页面链接。");
  }

  let request: CourseRequestContext;

  try {
    request = extractRequestContext(sourceUrl);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("请输入完整的微信约课页面链接。");
    }

    throw error;
  }
  return request;
}

function setFetchMenuOpen(isOpen: boolean): void {
  fetchMenu.classList.toggle("is-open", isOpen);
  fetchPanel?.classList.toggle("panel--menu-open", isOpen);
  fetchMenuPanel.hidden = !isOpen;
  fetchMenuTrigger.setAttribute("aria-expanded", String(isOpen));
}

function closeFetchMenu(): void {
  setFetchMenuOpen(false);
}

async function refreshSubscriptionUrl(): Promise<void> {
  const requestId = ++subscriptionRequestSerial;
  const request = tryExtractRequest(sourceUrlInput.value.trim());
  subscriptionUrlInput.value = "";
  syncActionButtons();

  if (window.location.protocol === "file:") {
    subscriptionNote.textContent = "请先正常打开这个网页，才能生成可添加到日历的链接。";
    return;
  }

  if (!request) {
    subscriptionNote.textContent = "";
    return;
  }

  subscriptionNote.textContent = "正在生成链接...";

  try {
    const subscriptionUrl = await createSubscriptionUrl(request, getCalendarName());
    if (requestId !== subscriptionRequestSerial) {
      return;
    }

    subscriptionUrlInput.value = subscriptionUrl;
    syncActionButtons();
  } catch (error) {
    if (requestId !== subscriptionRequestSerial) {
      return;
    }

    subscriptionNote.textContent = `订阅链接生成失败：${toErrorMessage(error)}`;
    return;
  }

  subscriptionNote.textContent = buildSubscriptionGuideText();
}

function renderStats(): void {
  stats.innerHTML = "";
  stats.hidden = true;
  coursePanelHint.hidden = false;

  if (state.courses.length === 0) {
    return;
  }

  const first = state.courses[0]?.start;
  const last = state.courses[state.courses.length - 1]?.start;
  const card = document.createElement("div");
  card.className = "stats__card";

  appendStatRow(card, "课程数", `${state.courses.length} 节`, true);

  if (first) {
    appendStatRow(card, "最早", formatShortDate(first));
  }

  if (last) {
    appendStatRow(card, "最晚", formatShortDate(last));
  }

  if (state.fetchedAt) {
    appendStatRow(card, "更新于", new Date(state.fetchedAt).toLocaleString("zh-CN"));
  }

  stats.append(card);
  stats.hidden = false;
  coursePanelHint.hidden = true;
}

function renderCourses(): void {
  courseList.innerHTML = "";

  if (state.courses.length === 0) {
    courseList.classList.add("is-empty");
    return;
  }

  courseList.classList.remove("is-empty");

  for (const [groupKey, courses] of groupCoursesByDate(state.courses)) {
    const section = document.createElement("section");
    section.className = "course-group";

    const header = document.createElement("div");
    header.className = "course-group__header";

    const title = document.createElement("h3");
    title.className = "course-group__title";
    title.textContent = formatCourseGroupLabel(courses[0]?.start ?? new Date(groupKey));

    const count = document.createElement("span");
    count.className = "course-group__count";
    count.textContent = `${courses.length} 节`;

    header.append(title, count);

    const grid = document.createElement("div");
    grid.className = "course-group__grid";

    for (const course of courses) {
      const card = document.createElement("article");
      card.className = "course-card";

      const cardHeader = document.createElement("div");
      cardHeader.className = "course-card__header";

      const cardTitle = document.createElement("h4");
      cardTitle.className = "course-card__title";
      cardTitle.textContent = course.title;

      const time = document.createElement("p");
      time.className = "course-card__time";
      time.textContent = formatRange(course.start, course.end);

      cardHeader.append(cardTitle, time);

      const meta = document.createElement("div");
      meta.className = "course-card__meta";

      appendMeta(meta, "教练", course.coach);
      appendMeta(meta, "教室", course.location);
      appendMeta(meta, "备注", course.comment ?? course.notes);

      card.append(cardHeader);

      if (meta.childElementCount > 0) {
        card.append(meta);
      }

      grid.append(card);
    }

    section.append(header, grid);
    courseList.append(section);
  }
}

function renderRequestStatus(): void {
  requestStatusBanner.className = "status-banner";

  if (!requestStatus) {
    requestStatusBanner.hidden = true;
    requestStatusBanner.textContent = "";
    return;
  }

  requestStatusBanner.hidden = false;
  requestStatusBanner.textContent = requestStatus.text;
  requestStatusBanner.classList.add(`status-banner--${requestStatus.tone}`);
}

function setRequestStatus(tone: StatusTone, text: string): void {
  requestStatus = { tone, text };
  renderRequestStatus();
}

function clearRequestStatus(): void {
  requestStatus = null;
  renderRequestStatus();
}

function appendMeta(container: HTMLElement, label: string, value?: string): void {
  if (!value) {
    return;
  }

  const line = document.createElement("p");
  line.className = "course-card__line";

  const key = document.createElement("span");
  key.className = "course-card__key";
  key.textContent = `${label}：`;

  const content = document.createElement("span");
  content.textContent = value;

  line.append(key, content);
  container.append(line);
}

function appendStatRow(container: HTMLElement, label: string, value: string, strong = false): void {
  const row = document.createElement("div");
  row.className = strong ? "stats__row stats__row--strong" : "stats__row";

  const key = document.createElement("span");
  key.className = "stats__label";
  key.textContent = label;

  const content = document.createElement("span");
  content.className = "stats__value";
  content.textContent = value;

  row.append(key, content);
  container.append(row);
}

function formatShortDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatCourseGroupLabel(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).format(date);
}

function groupCoursesByDate(courses: NormalizedCourse[]): Array<[string, NormalizedCourse[]]> {
  const groups = new Map<string, NormalizedCourse[]>();

  for (const course of courses) {
    const key = formatCourseGroupKey(course.start);
    const existing = groups.get(key);

    if (existing) {
      existing.push(course);
      continue;
    }

    groups.set(key, [course]);
  }

  return Array.from(groups.entries());
}

function formatCourseGroupKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildSubscriptionGuideText(): string {
  return [
    "Google 日历",
    "1. 打开 Google 日历网页版",
    "2. 在“其他日历”旁点“+”",
    "3. 选择“通过网址添加”",
    "4. 粘贴上方链接并添加",
    "",
    "iPhone 日历",
    "1. 打开 iPhone 上的“日历”App",
    "2. 点底部“日历”",
    "3. 滑动至底部，点击“添加日历”",
    "4. 选择“添加订阅日历”",
    "5. 粘贴上方链接，点“查找”后完成添加",
    "",
    "Mac 日历",
    "1. 打开“日历”App",
    "2. 选择“文件 > 新建日历订阅”",
    "3. 粘贴上方链接并完成订阅"
  ].join("\n");
}

function isCompleteRequest(value: Partial<CourseRequestContext>): value is CourseRequestContext {
  return Boolean(
    value.sourceUrl &&
      value.apiUrl &&
      value.openId &&
      value.lic &&
      value.memberGuid &&
      value.startDay
  );
}

function tryExtractRequest(sourceUrl: string): CourseRequestContext | null {
  try {
    return extractRequestContext(sourceUrl);
  } catch {
    return null;
  }
}

async function withBusy(button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
  const originalLabel = button.textContent;
  button.disabled = true;
  button.dataset.busy = "true";
  button.textContent = "处理中...";

  try {
    await action();
  } finally {
    button.disabled = false;
    delete button.dataset.busy;
    button.textContent = originalLabel;
  }
}

function syncActionButtons(): void {
  const hasSubscriptionUrl = Boolean(subscriptionUrlInput.value);
  subscriptionUrlInput.classList.toggle("subscription-link--ready", hasSubscriptionUrl);
  subscriptionUrlInput.title = hasSubscriptionUrl ? "点击输入框、右侧图标或下方按钮复制" : "";
  copySubscriptionButton.disabled = !hasSubscriptionUrl;
  copySubscriptionIconButton.disabled = !hasSubscriptionUrl;
}

function getCalendarName(): string {
  return calendarNameInput.value.trim() || DEFAULT_CALENDAR_NAME;
}

async function copySubscriptionUrl(): Promise<void> {
  if (!subscriptionUrlInput.value) {
    return;
  }

  subscriptionUrlInput.focus();
  subscriptionUrlInput.select();

  try {
    await navigator.clipboard.writeText(subscriptionUrlInput.value);
    showToast("success", "复制成功");
  } catch (error) {
    showToast("error", toErrorMessage(error));
  }
}

function showToast(tone: Exclude<StatusTone, "neutral">, text: string): void {
  const toast = document.createElement("div");
  toast.className = `toast toast--${tone}`;
  toast.textContent = text;

  toastStack.append(toast);
  requestAnimationFrame(() => {
    toast.classList.add("is-visible");
  });

  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  }, 2200);
}

async function createSubscriptionUrl(
  request: CourseRequestContext,
  calendarName: string
): Promise<string> {
  const response = await fetch("/api/create-subscription", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      accept: "application/json, text/plain, */*"
    },
    body: JSON.stringify({
      sourceUrl: request.sourceUrl,
      calendarName
    })
  });

  const responseText = await response.text();
  const parsed = safeParseJson(responseText);

  if (!response.ok) {
    const message =
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "string"
        ? parsed.error
        : "";
    throw new Error(message || "生成日历链接失败，请稍后再试。");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("subscriptionUrl" in parsed) ||
    typeof parsed.subscriptionUrl !== "string"
  ) {
    throw new Error("生成日历链接失败，请稍后再试。");
  }

  return (parsed as CreateSubscriptionResponse).subscriptionUrl;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}
