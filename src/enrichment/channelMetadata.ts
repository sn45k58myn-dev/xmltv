export interface ChannelMetadata {
  country?: string;
  category?: string;
}

const rules: Array<{
  match: RegExp;
  metadata: ChannelMetadata;
}> = [
  {
    match: /sky sports|eurosport|espn|tnt sports|premier sports/i,
    metadata: {
      country: 'GB',
      category: 'Sports'
    }
  },
  {
    match: /sky cinema|film4|movies|cinema/i,
    metadata: {
      country: 'GB',
      category: 'Movies'
    }
  },
  {
    match: /bbc|itv|channel 4|channel 5|uktv|dave|yesterday/i,
    metadata: {
      country: 'GB',
      category: 'Entertainment'
    }
  },
  {
    match: /cnn|bbc news|sky news|gb news|news/i,
    metadata: {
      country: 'GB',
      category: 'News'
    }
  }
];

export function enrichChannel(name: string): ChannelMetadata {
  for (const rule of rules) {
    if (rule.match.test(name)) {
      return rule.metadata;
    }
  }

  return {};
}











