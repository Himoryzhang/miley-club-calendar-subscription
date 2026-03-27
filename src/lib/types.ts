export interface RawCourseRecord {
  [key: string]: unknown;
}

export interface NormalizedCourse {
  id: string;
  title: string;
  start: Date;
  end: Date;
  startTime: string;
  endTime: string;
  comment?: string;
  coach?: string;
  location?: string;
  notes?: string;
  raw: RawCourseRecord;
}

export interface CourseRequestContext {
  sourceUrl: string;
  apiUrl: string;
  openId: string;
  lic: string;
  memberGuid: string;
  pageType?: string;
  startDay: string;
}

export interface CourseFetchResult {
  payload: unknown;
  startDay: string;
  showCourseDays?: number | null;
}

export interface SyncResult {
  created: number;
  updated: number;
}
