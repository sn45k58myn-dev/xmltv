import axios, { AxiosInstance } from 'axios';
import crypto from 'node:crypto';
import { env } from '../config/env';

type SchedulesDirectTokenResponse = {
  response?: string;
  token?: string;
  message?: string;
};

type SchedulesDirectLineup = {
  lineup?: string;
  name?: string;
  uri?: string;
};

type SchedulesDirectStation = {
  stationID: string;
  name?: string;
  callsign?: string;
  affiliate?: string;
};

type SchedulesDirectScheduleProgram = {
  programID: string;
  airDateTime: string;
  duration: number;
};

type SchedulesDirectSchedule = {
  stationID: string;
  programs?: SchedulesDirectScheduleProgram[];
};

type SchedulesDirectProgram = {
  programID: string;
  titles?: Array<Record<string, string>>;
  episodeTitle150?: string;
  descriptions?: {
    description100?: Array<Record<string, string>>;
    description1000?: Array<Record<string, string>>;
  };
  genres?: string[];
  entityType?: string;
};

type SchedulesDirectConfig = {
  username?: string;
  password?: string;
  lineup?: string;
  days: number;
  baseUrl: string;
  timeoutMs: number;
};

function defaultConfig(): SchedulesDirectConfig {
  return {
    username: env.SCHEDULES_DIRECT_USERNAME,
    password: env.SCHEDULES_DIRECT_PASSWORD,
    lineup: env.SCHEDULES_DIRECT_LINEUP,
    days: env.SCHEDULES_DIRECT_DAYS,
    baseUrl: env.SCHEDULES_DIRECT_BASE_URL,
    timeoutMs: env.SOURCE_FETCH_TIMEOUT_MS
  };
}

function sha1(value: string) {
  return crypto
    .createHash('sha1')
    .update(value)
    .digest('hex');
}

function xmlEscape(value: string | undefined) {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmltvDate(value: Date) {
  const pad = (input: number) => String(input).padStart(2, '0');

  return `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}${pad(value.getUTCSeconds())} +0000`;
}

function dateRange(days: number) {
  return Array.from({
    length: Math.max(1, days)
  }, (_value, index) => {
    const date = new Date();

    date.setUTCDate(date.getUTCDate() + index);

    return date.toISOString().slice(0, 10);
  });
}

function firstText(rows: Array<Record<string, string>> | undefined) {
  const row = rows?.[0];

  if (!row) {
    return undefined;
  }

  return Object.values(row)[0];
}

function programTitle(program?: SchedulesDirectProgram) {
  return firstText(program?.titles) ?? program?.programID ?? 'Untitled';
}

function programDescription(program?: SchedulesDirectProgram) {
  return firstText(program?.descriptions?.description1000) ??
    firstText(program?.descriptions?.description100);
}

function stationName(station: SchedulesDirectStation) {
  return station.callsign ?? station.name ?? station.stationID;
}

export class SchedulesDirectClient {
  private token?: string;

  constructor(
    private readonly client: AxiosInstance = axios.create({
      baseURL: defaultConfig().baseUrl,
      timeout: defaultConfig().timeoutMs,
      validateStatus: (status) => status >= 200 && status < 300
    }),
    private readonly config: SchedulesDirectConfig = defaultConfig()
  ) {}

  async authenticate() {
    if (!this.config.username || !this.config.password) {
      throw new Error('Schedules Direct username and password are required.');
    }

    const response = await this.client.post<SchedulesDirectTokenResponse>('/token', {
      username: this.config.username,
      password: sha1(this.config.password)
    });

    if (response.data.response !== 'OK' || !response.data.token) {
      throw new Error(response.data.message ?? 'Schedules Direct authentication failed.');
    }

    this.token = response.data.token;

    return this.token;
  }

  private async request<T>(
    method: 'get' | 'post',
    url: string,
    data?: unknown,
    allowRefresh = true
  ): Promise<T> {
    const token = this.token ?? await this.authenticate();

    try {
      const response = await this.client.request<T>({
        method,
        url,
        data,
        headers: {
          token
        }
      });

      return response.data;
    } catch (error) {
      if (
        allowRefresh &&
        axios.isAxiosError(error) &&
        error.response?.status === 401
      ) {
        await this.authenticate();

        return this.request<T>(
          method,
          url,
          data,
          false
        );
      }

      throw error;
    }
  }

  async getLineup() {
    if (this.config.lineup) {
      return this.config.lineup;
    }

    const lineups = await this.request<SchedulesDirectLineup[]>('get', '/lineups');
    const lineup = lineups[0]?.lineup ?? lineups[0]?.uri;

    if (!lineup) {
      throw new Error('Schedules Direct account has no configured lineups.');
    }

    return lineup;
  }

  async getStations(lineup: string) {
    const response = await this.request<unknown>('get', `/lineups/${encodeURIComponent(lineup)}`);

    if (Array.isArray(response)) {
      return response as SchedulesDirectStation[];
    }

    const data = response as {
      stations?: SchedulesDirectStation[];
      map?: Array<{ stationID: string; callsign?: string; name?: string }>;
    };

    if (data.stations?.length) {
      return data.stations;
    }

    return (data.map ?? []).map((row): SchedulesDirectStation => ({
      stationID: row.stationID,
      callsign: row.callsign,
      name: row.name
    }));
  }

  async getSchedules(stations: SchedulesDirectStation[]) {
    const requests = stations.flatMap((station) =>
      dateRange(this.config.days).map((date) => ({
        stationID: station.stationID,
        date
      }))
    );

    if (!requests.length) {
      return [];
    }

    return this.request<SchedulesDirectSchedule[]>('post', '/schedules', requests);
  }

  async getPrograms(programIds: string[]) {
    const uniqueIds = Array.from(new Set(programIds));
    const programs = new Map<string, SchedulesDirectProgram>();

    for (let i = 0; i < uniqueIds.length; i += 500) {
      const batch = uniqueIds.slice(i, i + 500);
      const response = await this.request<SchedulesDirectProgram[]>('post', '/programs', batch);

      for (const program of response) {
        programs.set(program.programID, program);
      }
    }

    return programs;
  }
}

export async function fetchSchedulesDirectXmltv(
  client = new SchedulesDirectClient()
) {
  const lineup = await client.getLineup();
  const stations = await client.getStations(lineup);
  const schedules = await client.getSchedules(stations);
  const programIds = schedules.flatMap((schedule) =>
    schedule.programs?.map((program) => program.programID) ?? []
  );
  const programs = await client.getPrograms(programIds);
  const stationsById = new Map<string, SchedulesDirectStation>(
    stations.map((station) => [station.stationID, station] as const)
  );
  const xml: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<tv generator-info-name="xmltv-aggregator-schedules-direct">'
  ];

  for (const station of stations) {
    xml.push(`  <channel id="${xmlEscape(station.stationID)}">`);
    xml.push(`    <display-name>${xmlEscape(stationName(station))}</display-name>`);

    if (station.name && station.name !== stationName(station)) {
      xml.push(`    <display-name>${xmlEscape(station.name)}</display-name>`);
    }

    if (station.affiliate && station.affiliate !== stationName(station)) {
      xml.push(`    <display-name>${xmlEscape(station.affiliate)}</display-name>`);
    }

    xml.push('  </channel>');
  }

  for (const schedule of schedules) {
    const station = stationsById.get(schedule.stationID);

    if (!station) {
      continue;
    }

    for (const scheduleProgram of schedule.programs ?? []) {
      const start = new Date(scheduleProgram.airDateTime);
      const stop = new Date(start.getTime() + scheduleProgram.duration * 1000);
      const program = programs.get(scheduleProgram.programID);

      xml.push(`  <programme start="${xmltvDate(start)}" stop="${xmltvDate(stop)}" channel="${xmlEscape(station.stationID)}">`);
      xml.push(`    <title>${xmlEscape(programTitle(program))}</title>`);

      if (program?.episodeTitle150) {
        xml.push(`    <sub-title>${xmlEscape(program.episodeTitle150)}</sub-title>`);
      }

      const description = programDescription(program);

      if (description) {
        xml.push(`    <desc>${xmlEscape(description)}</desc>`);
      }

      for (const genre of program?.genres ?? []) {
        xml.push(`    <category>${xmlEscape(genre)}</category>`);
      }

      if (program?.entityType) {
        xml.push(`    <category>${xmlEscape(program.entityType)}</category>`);
      }

      xml.push('  </programme>');
    }
  }

  xml.push('</tv>');

  return xml.join('\n');
}
