export interface ChannelMetadata {
  country?: string;
  category?: string;
}

const countryRules: Array<{
  match: RegExp;
  country: string;
}> = [
  {
    match: /\b(bbc|itv|channel 4|channel 5|uktv|sky|gb news)\b/i,
    country: 'GB'
  },
  {
    match: /\b(abc|cbs|nbc|fox|pbs|cw|usa network|accuweather|espn|mlb|nba|nfl|nhl)\b/i,
    country: 'US'
  }
];

const categoryRules: Array<{
  match: RegExp;
  category: string;
}> = [
  {
    match: /\b(news|cnn|msnbc|cnbc|fox news|bbc news|sky news|gb news|al jazeera|weather|accuweather)\b/i,
    category: 'News'
  },
  {
    match: /\b(sport|sports|espn|eurosport|tnt sports|premier sports|cricket|football|soccer|golf|tennis|racing|nfl|nba|mlb|nhl|ufc|fight|fubo)\b/i,
    category: 'Sports'
  },
  {
    match: /\b(movie|movies|cinema|film|film4|hbo|showtime|starz|tcm|mgm|fxm|actionmax|cinemax)\b/i,
    category: 'Movies'
  },
  {
    match: /\b(action channel|actionmax|action max)\b/i,
    category: 'Movies'
  },
  {
    match: /\b(comedy|laugh|adult swim|adultswim|cartoon network)\b/i,
    category: 'Comedy'
  },
  {
    match: /\b(kids|kid|cartoon|disney|nick|nickelodeon|boomerang|pbs kids|baby|junior|cbeebies)\b/i,
    category: 'Kids'
  },
  {
    match: /\b(documentary|docs|history|discovery|science|nat geo|national geographic|smithsonian|animal planet|nature)\b/i,
    category: 'Documentary'
  },
  {
    match: /\b(music|mtv|vh1|vevo|cmt|kerrang|kiss|box hits)\b/i,
    category: 'Music'
  },
  {
    match: /\b(food|cooking|travel|home|hgtv|diy|garden|lifetime|style|fashion|bravo|tlc)\b/i,
    category: 'Lifestyle'
  },
  {
    match: /\b(crime|crimes|investigation|mystery|court tv|law & crime|forensic)\b/i,
    category: 'Crime'
  },
  {
    match: /\b(faith|gospel|church|religion|islam|christian|tbn|ewtn)\b/i,
    category: 'Religious'
  },
  {
    match: /\b(bbc|itv|channel 4|channel 5|uktv|dave|yesterday|abc|cbs|nbc|fox|cw|a&e|amc|fx|fxx|tbs|tnt|usa network|paramount|syfy|we tv)\b/i,
    category: 'Entertainment'
  }
];

export function enrichChannel(name: string): ChannelMetadata {
  const metadata: ChannelMetadata = {};

  for (const rule of countryRules) {
    if (rule.match.test(name)) {
      metadata.country = rule.country;
      break;
    }
  }

  for (const rule of categoryRules) {
    if (rule.match.test(name)) {
      metadata.category = rule.category;
      break;
    }
  }

  return metadata;
}
