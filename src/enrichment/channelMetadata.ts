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
    match: /\b(bloomberg|cnbc|business|markets|economy|finance|france ?24|euronews|rai ?news|channel newsasia|nhk world|tvp world)\b/i,
    category: 'News'
  },
  {
    match: /\b(sport|sports|skysp|espn|eurosport|tnt sports|premier sports|cricket|football|soccer|golf|tennis|racing|nfl|nba|mlb|nhl|ufc|fight|fubo|laliga|bowling|outdoor channel|nautical)\b/i,
    category: 'Sports'
  },
  {
    match: /\b(movie|movies|cinema|film|film4|hbo|showtime|starz|tcm|mgm|fxm|actionmax|cinemax|talkingpictures|romance)\b/i,
    category: 'Movies'
  },
  {
    match: /\b(action channel|actionmax|action max)\b/i,
    category: 'Movies'
  },
  {
    match: /\b(comedy|sitcom|laugh|adult swim|adultswim|cartoon network)\b/i,
    category: 'Comedy'
  },
  {
    match: /\b(kids|kid|cartoon|toon|ducktv|disney|nick|nickelodeon|boomerang|pbs kids|baby|junior|cbeebies|cartoonito|minimini|jimjam|yoyo|teletoon|ketnet|canal panda|rai yoyo|spongebob|polsat jimjam)\b/i,
    category: 'Kids'
  },
  {
    match: /\b(documentary|docs|history|discovery|disc\.?|science|nat geo|natgeo|national geographic|smithsonian|animal planet|nature|quest|curiosity|air and space|repair shop|da vinci|oficios perdidos|heritage|nesting tv|homeful|love pets|pet collective)\b/i,
    category: 'Documentary'
  },
  {
    match: /\b(music|música|mtv|vh1|vevo|cmt|kerrang|kiss|box hits|virgin radio|r101|radio|club tv)\b/i,
    category: 'Music'
  },
  {
    match: /\b(food|cooking|masala|travel|home|hgtv|diy|garden|lifetime|style|fashion|bravo|tlc|gusto|ideal world|jewellery|gemporia|warehouse|shopping|shop|cruise|okazje|fashionbox)\b/i,
    category: 'Lifestyle'
  },
  {
    match: /\b(crime|crimes|investigation|mystery|court tv|law & crime|forensic)\b/i,
    category: 'Crime'
  },
  {
    match: /\b(faith|gospel|church|god tv|god channel|religion|religious|islam|sikh|madani|takbeer|christian|tbn|ewtn|daystar|sonlife|revelation|sangat|qtv)\b/i,
    category: 'Religious'
  },
  {
    match: /\b(bbc|itv|channel 4|channel 5|s4c|stv|utv|rte|rté|tg4|uktv|dave|yesterday|abc|cbs|nbc|fox|cw|a&e|amc|fx|fxx|tbs|tnt|usa network|paramount|syfy|we tv|sky mix|sky arts|sky max|sky one|great! tv|great tv|more4|e4|5star|5usa|really|alibi|legend|challenge|together|zee tv|colors|utsav|hum|atn|ion tv|black voices)\b/i,
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
