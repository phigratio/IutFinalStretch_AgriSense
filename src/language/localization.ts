import { type IntakeField, type IntakeProfile } from "../agent/intakeSchema.js";
import { type SeasonPlanResult, type WeatherForecast } from "../agrisense/types.js";

export type SupportedLanguage = "en" | "bn" | "banglish";

const BANGLA_DIGITS: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

const BANGLISH_MARKERS = [
  "ami",
  "amar",
  "jomi",
  "jomir",
  "mati",
  "pani",
  "sech",
  "brishti",
  "bristi",
  "borsha",
  "bele",
  "doash",
  "etel",
  "koto",
  "khoroch",
  "taka",
  "chash",
  "fasol",
  "dhan",
  "alu",
  "shorisha",
  "vutta",
  "nodi",
  "pukur",
  "khal",
];

const TERM_ALIASES: Array<[RegExp, string]> = [
  [/\b(ami|amar)\b/g, "farmer"],
  [/\b(jomi|jomir|land)\b/g, "land farm"],
  [/\b(mati|soil)\b/g, "soil"],
  [/\b(bele doash|bele-doash)\b/g, "sandy loam"],
  [/\b(bele)\b/g, "sandy"],
  [/\b(doash|doansh)\b/g, "loam"],
  [/\b(etel|atel)\b/g, "clay"],
  [/\b(pani|sech)\b/g, "water irrigation"],
  [/\b(brishti|bristi|borsha)\b/g, "rain rainfed monsoon"],
  [/\b(nodi|nodir)\b/g, "river"],
  [/\b(pukur)\b/g, "pond"],
  [/\b(khal)\b/g, "canal"],
  [/\b(khoroch|budget|taka|tk)\b/g, "budget taka bdt"],
  [/\b(fasol|crop|chash)\b/g, "crop cultivation"],
  [/\b(dhan)\b/g, "rice"],
  [/\b(alu)\b/g, "potato"],
  [/\b(shorisha|sorisha)\b/g, "mustard"],
  [/\b(vutta|bhutta)\b/g, "maize"],
  [/ধান/g, " rice dhan "],
  [/আলু/g, " potato alu "],
  [/সরিষা/g, " mustard shorisha "],
  [/ভুট্টা/g, " maize vutta "],
  [/জমি/g, " land farm jomi "],
  [/মাটি/g, " soil mati "],
  [/বেলে দোআঁশ/g, " sandy loam bele doash "],
  [/বেলে/g, " sandy bele "],
  [/দোআঁশ/g, " loam doash "],
  [/এঁটেল/g, " clay etel "],
  [/পানি|সেচ/g, " water irrigation pani sech "],
  [/বৃষ্টি/g, " rain rainfed brishti "],
  [/নদী/g, " river nodi "],
  [/পুকুর/g, " pond pukur "],
  [/খাল/g, " canal khal "],
  [/টাকা|৳/g, " taka bdt budget "],
  [/হাজার/g, " thousand hazar "],
  [/একর/g, " acre "],
  [/গাজীপুর/g, " Gazipur "],
  [/ঢাকা/g, " Dhaka "],
  [/বগুড়া|বগুড়া/g, " Bogura "],
  [/রংপুর/g, " Rangpur "],
  [/দিনাজপুর/g, " Dinajpur "],
  [/রাজশাহী/g, " Rajshahi "],
  [/আমন/g, " Aman "],
  [/বোরো/g, " Boro "],
  [/আউশ/g, " Aus "],
  [/রবি/g, " Rabi "],
  [/বর্ষা/g, " Monsoon "],
];

export function normalizeLanguage(value?: string): SupportedLanguage | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["bn", "bangla", "bengali"].includes(normalized)) return "bn";
  if (["banglish", "bn-en", "roman-bangla", "romanized-bangla"].includes(normalized)) return "banglish";
  if (["en", "english"].includes(normalized)) return "en";
  return undefined;
}

export function detectInputLanguage(message: string, fallback?: string): SupportedLanguage {
  const explicit = normalizeLanguage(fallback);
  const banglaChars = (message.match(/[\u0980-\u09FF]/g) ?? []).length;
  if (banglaChars >= 2) return "bn";

  const lower = normalizeBanglaDigits(message).toLowerCase();
  const banglishHits = BANGLISH_MARKERS.filter((marker) => new RegExp(`\\b${marker}\\b`).test(lower)).length;
  if (banglishHits >= 2) return "banglish";

  return explicit ?? "en";
}

export function normalizeBanglaDigits(value: string): string {
  return value.replace(/[০-৯]/g, (digit) => BANGLA_DIGITS[digit] ?? digit);
}

export function buildMultilingualQuery(input: string): string {
  const digitNormalized = normalizeBanglaDigits(input);
  const lower = digitNormalized.toLowerCase();
  const canonicalTerms = TERM_ALIASES.flatMap(([pattern, replacement]) => {
    pattern.lastIndex = 0;
    return pattern.test(lower) || pattern.test(digitNormalized) ? [replacement] : [];
  });

  return [digitNormalized, canonicalTerms.join(" ")]
    .filter((part) => part.trim().length > 0)
    .join("\nCanonical English/Banglish terms: ");
}

export function localizeFollowUpReply(
  profile: Pick<IntakeProfile, "locationText" | "sizeAcres" | "soilType" | "waterAvailability" | "budgetBdt" | "targetSeason">,
  missingFields: IntakeField[],
  language: SupportedLanguage,
): string {
  const known = [
    profile.locationText ? knownPhrase("location", profile.locationText, language) : undefined,
    profile.sizeAcres ? knownPhrase("farmSize", `${profile.sizeAcres}`, language) : undefined,
    profile.soilType ? knownPhrase("soilType", profile.soilType, language) : undefined,
    profile.waterAvailability ? knownPhrase("waterAvailability", profile.waterAvailability, language) : undefined,
    profile.budgetBdt ? knownPhrase("budget", `${profile.budgetBdt}`, language) : undefined,
    profile.targetSeason ? knownPhrase("targetSeason", profile.targetSeason, language) : undefined,
  ].filter(Boolean);

  const questions = missingFields.map((field) => gapLabel(field, language)).join(language === "en" ? ", " : ", ");
  if (language === "bn") {
    return known.length === 0
      ? `আমি মৌসুম পরিকল্পনা করতে পারব। দয়া করে বলুন: ${questions}।`
      : `বুঝেছি: ${known.join(", ")}। এখন বলুন: ${questions}।`;
  }
  if (language === "banglish") {
    return known.length === 0
      ? `Ami season plan korte parbo. Please bolun: ${questions}.`
      : `Bujhlam: ${known.join(", ")}. Ekhon bolun: ${questions}.`;
  }

  return known.length === 0
    ? `I can help plan the season. Please tell me ${questions}.`
    : `Got it: ${known.join(", ")}. Please tell me ${questions}.`;
}

export function localizeCompleteReply(profile: IntakeProfile, language: SupportedLanguage): string {
  if (language === "bn") {
    return [
      "ইনটেক সম্পূর্ণ হয়েছে।",
      `আমার কাছে আছে: ${profile.locationText}, ${profile.sizeAcres} একর, ${profile.soilType} মাটি, ${profile.waterAvailability} পানি, ৳${profile.budgetBdt} বাজেট, ${profile.targetSeason} মৌসুম।`,
      "এখন আমি লোকেশন জিওকোড করব, লাইভ আবহাওয়া আনব, জ্ঞানভান্ডার/RAG খুঁজব, তারপর ফসল র‍্যাঙ্ক করব।",
    ].join(" ");
  }
  if (language === "banglish") {
    return [
      "Intake complete hoye geche.",
      `Amar kache ache: ${profile.locationText}, ${profile.sizeAcres} acre, ${profile.soilType} mati, ${profile.waterAvailability} pani, ৳${profile.budgetBdt} budget, ${profile.targetSeason} season.`,
      "Ekhon ami location geocode, live weather, RAG knowledge base search, tarpor crop ranking korbo.",
    ].join(" ");
  }

  return [
    "Intake complete.",
    `I have ${profile.locationText}, ${profile.sizeAcres} acres, ${profile.soilType} soil, ${profile.waterAvailability} water, ৳${profile.budgetBdt} budget, and ${profile.targetSeason} season.`,
    "Next I will geocode the location, fetch live weather, search the crop knowledge base, and rank crops.",
  ].join(" ");
}

export function localizePlanSummary(input: {
  crop: string;
  score: number;
  weather: WeatherForecast;
  netProfitBdt: number;
  language: SupportedLanguage;
}): string {
  const today = input.weather.daily[0];
  const rain = today?.rainfallMm ?? 0;
  const min = today?.temperatureMinC ?? 0;
  const max = today?.temperatureMaxC ?? 0;

  if (input.language === "bn") {
    return `ইনটেক ও পরিকল্পনা টুল শেষ হয়েছে। সেরা ফসল: ${cropName(input.crop, "bn")} (${input.score}/100)। আজ ${input.weather.locationText}-এ বৃষ্টি ${rain} মিমি, তাপমাত্রা ${min}-${max}°C। আনুমানিক নিট লাভ ৳${input.netProfitBdt}।`;
  }
  if (input.language === "banglish") {
    return `Intake ar planning tools complete. Top crop: ${cropName(input.crop, "banglish")} (${input.score}/100). Aj ${input.weather.locationText}-e brishti ${rain}mm, temperature ${min}-${max}C. Estimated net profit ৳${input.netProfitBdt}.`;
  }

  return `I completed the intake and ran the planning tools. Top crop: ${input.crop} (${input.score}/100). Today in ${input.weather.locationText}: ${rain}mm rain, ${min}-${max}C. Estimated net profit is ৳${input.netProfitBdt}.`;
}

export function localizeSeasonPlan(plan: SeasonPlanResult, language: SupportedLanguage): SeasonPlanResult {
  if (language === "en") return plan;
  return {
    ...plan,
    crop: cropName(plan.crop, language),
    tasks: plan.tasks.map((task) => ({
      ...task,
      title: localizeTaskTitle(task.title, task.phase, language),
      description: localizeTaskDescription(task.description, task.phase, language),
    })),
  };
}

function gapLabel(field: IntakeField, language: SupportedLanguage): string {
  const labels: Record<IntakeField, Record<SupportedLanguage, string>> = {
    location: { en: "where the land is", bn: "জমি কোথায়", banglish: "jomi kothay" },
    farmSize: { en: "how large the farm is", bn: "জমির পরিমাণ কত", banglish: "jomi koto boro" },
    soilType: { en: "the soil type", bn: "মাটির ধরন", banglish: "matir dhoron" },
    waterAvailability: { en: "the water source or availability", bn: "পানি/সেচের উৎস", banglish: "pani/sech er source" },
    budget: { en: "your budget in BDT", bn: "বাজেট কত টাকা", banglish: "budget koto taka" },
    targetSeason: { en: "the target season", bn: "কোন মৌসুমে চাষ করবেন", banglish: "kon season e chash korben" },
  };
  return labels[field][language];
}

function knownPhrase(field: IntakeField, value: string, language: SupportedLanguage): string {
  if (language === "bn") {
    const labels: Record<IntakeField, string> = {
      location: `লোকেশন ${value}`,
      farmSize: `${value} একর জমি`,
      soilType: `${value} মাটি`,
      waterAvailability: `${value} পানি`,
      budget: `৳${value} বাজেট`,
      targetSeason: `${value} মৌসুম`,
    };
    return labels[field];
  }
  if (language === "banglish") {
    const labels: Record<IntakeField, string> = {
      location: `location ${value}`,
      farmSize: `${value} acre jomi`,
      soilType: `${value} mati`,
      waterAvailability: `${value} pani`,
      budget: `৳${value} budget`,
      targetSeason: `${value} season`,
    };
    return labels[field];
  }

  const labels: Record<IntakeField, string> = {
    location: `location ${value}`,
    farmSize: `${value} acre farm size`,
    soilType: `${value} soil`,
    waterAvailability: `${value} water`,
    budget: `৳${value} budget`,
    targetSeason: `${value} season`,
  };
  return labels[field];
}

function cropName(crop: string, language: SupportedLanguage): string {
  if (language === "bn") {
    return {
      rice: "ধান",
      maize: "ভুট্টা",
      potato: "আলু",
      mustard: "সরিষা",
      tomato: "টমেটো",
    }[crop] ?? crop;
  }
  if (language === "banglish") {
    return {
      rice: "dhan",
      maize: "vutta",
      potato: "alu",
      mustard: "shorisha",
      tomato: "tomato",
    }[crop] ?? crop;
  }
  return crop;
}

function localizeTaskTitle(title: string, phase: string, language: SupportedLanguage): string {
  const bangla: Record<string, string> = {
    "land-prep": "জমি প্রস্তুত ও ইনপুট বাজেট",
    sowing: "বপন/রোপণ",
    fertilizer: "ভাগ করে সার প্রয়োগ",
    irrigation: "সেচের প্রয়োজন যাচাই",
    weed: "আগাছা নিয়ন্ত্রণ চেকপয়েন্ট",
    "pest-check": "পোকা ও রোগ পর্যবেক্ষণ",
    harvest: "ফসল সংগ্রহ",
  };
  const banglish: Record<string, string> = {
    "land-prep": "Jomi ready ar input budget",
    sowing: "Bopon/ropon",
    fertilizer: "Vag kore shar apply",
    irrigation: "Sech dorkar check",
    weed: "Agacha control checkpoint",
    "pest-check": "Poka ar rog check",
    harvest: "Fasol harvest",
  };
  if (language === "bn") return bangla[phase] ?? title;
  if (language === "banglish") return banglish[phase] ?? title;
  return title;
}

function localizeTaskDescription(description: string, phase: string, language: SupportedLanguage): string {
  const bangla: Record<string, string> = {
    "land-prep": "বপনের আগে জমি প্রস্তুত করুন এবং ইনপুট খরচ আলাদা রাখুন।",
    sowing: "আগামী ৩ দিনে ভারী বৃষ্টির ঝুঁকি কম থাকলে বপন/রোপণ করুন।",
    fertilizer: "ভারী বৃষ্টির ঠিক আগে সার দেবেন না; ভাগ করে সার দিন।",
    irrigation: "ফসলের ধাপ অনুযায়ী বৃষ্টি কম হলে সেচ দিন।",
    weed: "আগাছা ফসলের ফলন কমানোর আগে মাঠ পরীক্ষা করুন।",
    "pest-check": "পাতা ও কান্ড দেখুন; লক্ষণ থাকলে চিকিৎসা দিন।",
    harvest: "ফসল তুলে বিক্রি বা সংরক্ষণের সিদ্ধান্ত নিন।",
  };
  const banglish: Record<string, string> = {
    "land-prep": "Bopon er age jomi ready korun ar input khoroch alada rakhun.",
    sowing: "Agami 3 dine heavy brishti risk kom thakle bopon/ropon korun.",
    fertilizer: "Heavy brishti er thik age shar deben na; vag kore shar din.",
    irrigation: "Crop stage onujayi brishti kom hole sech din.",
    weed: "Agacha yield komanor age math check korun.",
    "pest-check": "Pata ar kandho check korun; symptom thakle treatment din.",
    harvest: "Fasol tule sell/store decision nin.",
  };
  if (language === "bn") return bangla[phase] ?? description;
  if (language === "banglish") return banglish[phase] ?? description;
  return description;
}
