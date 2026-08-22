/**
 * Country-specific bank and state catalogs for searchable dropdowns.
 * Add the next client country here; country-profile.js remains the switch.
 * Unset countries use the United States lists so Assurance is unchanged.
 */

function item(name, aliases = []) {
  return { name, aliases };
}

const US_STATES = [
  item("Alabama", ["AL"]),
  item("Alaska", ["AK"]),
  item("Arizona", ["AZ"]),
  item("Arkansas", ["AR"]),
  item("California", ["CA"]),
  item("Colorado", ["CO"]),
  item("Connecticut", ["CT"]),
  item("Delaware", ["DE"]),
  item("District of Columbia", ["DC", "Washington DC", "Washington D.C."]),
  item("Florida", ["FL"]),
  item("Georgia", ["GA"]),
  item("Hawaii", ["HI"]),
  item("Idaho", ["ID"]),
  item("Illinois", ["IL"]),
  item("Indiana", ["IN"]),
  item("Iowa", ["IA"]),
  item("Kansas", ["KS"]),
  item("Kentucky", ["KY"]),
  item("Louisiana", ["LA"]),
  item("Maine", ["ME"]),
  item("Maryland", ["MD"]),
  item("Massachusetts", ["MA"]),
  item("Michigan", ["MI"]),
  item("Minnesota", ["MN"]),
  item("Mississippi", ["MS"]),
  item("Missouri", ["MO"]),
  item("Montana", ["MT"]),
  item("Nebraska", ["NE"]),
  item("Nevada", ["NV"]),
  item("New Hampshire", ["NH"]),
  item("New Jersey", ["NJ"]),
  item("New Mexico", ["NM"]),
  item("New York", ["NY"]),
  item("North Carolina", ["NC"]),
  item("North Dakota", ["ND"]),
  item("Ohio", ["OH"]),
  item("Oklahoma", ["OK"]),
  item("Oregon", ["OR"]),
  item("Pennsylvania", ["PA"]),
  item("Rhode Island", ["RI"]),
  item("South Carolina", ["SC"]),
  item("South Dakota", ["SD"]),
  item("Tennessee", ["TN"]),
  item("Texas", ["TX"]),
  item("Utah", ["UT"]),
  item("Vermont", ["VT"]),
  item("Virginia", ["VA"]),
  item("Washington", ["WA"]),
  item("West Virginia", ["WV"]),
  item("Wisconsin", ["WI"]),
  item("Wyoming", ["WY"]),
];

const US_BANKS = [
  item("Bank of America", ["BoA", "BofA"]),
  item("Chase", ["JPMorgan Chase", "JP Morgan"]),
  item("Wells Fargo", []),
  item("U.S. Bank", ["US Bank"]),
  item("Citibank", ["Citi"]),
];

/** 36 states + FCT. Official spelling Nasarawa (Nassarawa is an alias). */
const NG_STATES = [
  item("Abia", []),
  item("Adamawa", []),
  item("Akwa Ibom", ["Akwa-Ibom"]),
  item("Anambra", []),
  item("Bauchi", []),
  item("Bayelsa", []),
  item("Benue", []),
  item("Borno", []),
  item("Cross River", ["Cross-River"]),
  item("Delta", []),
  item("Ebonyi", []),
  item("Edo", []),
  item("Ekiti", []),
  item("Enugu", []),
  item("Gombe", []),
  item("Imo", []),
  item("Jigawa", []),
  item("Kaduna", []),
  item("Kano", []),
  item("Katsina", []),
  item("Kebbi", []),
  item("Kogi", []),
  item("Kwara", []),
  item("Lagos", []),
  item("Nasarawa", ["Nassarawa"]),
  item("Niger", []),
  item("Ogun", []),
  item("Ondo", []),
  item("Osun", []),
  item("Oyo", []),
  item("Plateau", []),
  item("Rivers", ["River State"]),
  item("Sokoto", []),
  item("Taraba", []),
  item("Yobe", []),
  item("Zamfara", []),
  item("Federal Capital Territory (Abuja)", ["FCT", "Abuja", "FCT Abuja", "FCT (Abuja)"]),
];

/**
 * CBN deposit-money banks (commercial, non-interest, merchant) plus
 * common statement names and widely used digital/microfinance brands.
 */
const NG_BANKS = [
  item("Access Bank", ["Access"]),
  item("Citibank Nigeria", ["Citi Nigeria", "Citibank"]),
  item("Ecobank Nigeria", ["Ecobank"]),
  item("Fidelity Bank", ["Fidelity"]),
  item("First Bank of Nigeria", ["First Bank", "FirstBank", "FBN"]),
  item("First City Monument Bank (FCMB)", ["FCMB", "First City Monument Bank"]),
  item("Globus Bank", ["Globus"]),
  item("Guaranty Trust Bank (GTBank)", ["GTBank", "GTB", "GT Bank", "Guaranty Trust"]),
  item("Keystone Bank", ["Keystone"]),
  item("Optimus Bank", ["Optimus"]),
  item("Parallex Bank", ["Parallex"]),
  item("Polaris Bank", ["Polaris"]),
  item("Premium Trust Bank", ["PremiumTrust", "PremiumTrust Bank"]),
  item("Providus Bank", ["Providus"]),
  item("Stanbic IBTC Bank", ["Stanbic", "Stanbic IBTC", "IBTC"]),
  item("Standard Chartered Bank", ["Standard Chartered", "StanChart"]),
  item("Sterling Bank", ["Sterling"]),
  item("SunTrust Bank", ["Suntrust", "SunTrust"]),
  item("Titan Trust Bank", ["Titan Trust", "Titan"]),
  item("Union Bank of Nigeria", ["Union Bank"]),
  item("United Bank for Africa (UBA)", ["UBA", "United Bank of Africa", "United Bank for Africa"]),
  item("Unity Bank", ["Unity"]),
  item("Wema Bank", ["Wema"]),
  item("Zenith Bank", ["Zenith"]),
  item("Jaiz Bank", ["Jaiz"]),
  item("TAJBank", ["TAJ Bank", "Taj Bank"]),
  item("Lotus Bank", ["Lotus"]),
  item("The Alternative Bank", ["Alternative Bank"]),
  item("Coronation Merchant Bank", ["Coronation"]),
  item("FBNQuest Merchant Bank", ["FBN Merchant Bank", "FBNQuest"]),
  item("FSDH Merchant Bank", ["FSDH"]),
  item("Greenwich Merchant Bank", ["Greenwich"]),
  item("Nova Merchant Bank", ["Nova"]),
  item("Rand Merchant Bank", ["RMB", "Rand Merchant"]),
  item("Heritage Bank", ["Heritage"]),
  item("Signature Bank", ["Signature"]),
  item("Kuda", ["Kuda Bank"]),
  item("OPay", ["OPay Microfinance", "Opera"]),
  item("PalmPay", []),
  item("Moniepoint", ["Moniepoint MFB", "TeamApt"]),
  item("Carbon", ["Paylater", "Carbon MFB"]),
  item("FairMoney", ["FairMoney MFB"]),
  item("VFD Microfinance Bank", ["VBank", "VFD"]),
  item("Sparkle", ["Sparkle MFB"]),
  item("Rubies Bank", ["Rubies MFB", "Rubies"]),
];

const CATALOGS = {
  US: { banks: US_BANKS, states: US_STATES },
  NG: { banks: NG_BANKS, states: NG_STATES },
};

function getCountryCatalog(code) {
  return CATALOGS[String(code || "US").toUpperCase()] || CATALOGS.US;
}

module.exports = {
  CATALOGS,
  US_STATES,
  US_BANKS,
  NG_STATES,
  NG_BANKS,
  getCountryCatalog,
};
