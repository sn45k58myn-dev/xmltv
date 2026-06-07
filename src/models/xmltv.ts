export type XmltvChannel = {
  id: string;
  displayName: string;
  icon?: string;
  country?: string;
  category?: string;
  aliases?: string[];
};

export type XmltvProgram = {
  channel: string;
  title: string;
  subtitle?: string;
  description?: string;
  category?: string;
  start: Date;
  stop: Date;
};

export type ParsedXmltv = {
  channels: XmltvChannel[];
  programs: XmltvProgram[];
};

export type SourceDefinition = {
  name: string;
  type: 'epg.pw' | 'iptv-org' | 'schedules-direct' | 'custom-url' | 'upload';
  url?: string;
  priority?: number;
};
