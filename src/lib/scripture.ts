/**
 * Quran and Hadith evidence shown next to the Islamic tools.
 *
 * Quran: Surah:Ayah. Hadith numbers follow sunnah.com (Bukhari: Fath al-Bari
 * numbering; Abu Dawud, Tirmidhi, Muslim: their standard editions). The Khmer
 * and English lines are translations of the meaning, not the Quran itself;
 * they should be reviewed by a local Imam before being relied on.
 */

export type Citation = {
  /** e.g. "At-Tawbah 9:103" or "Sunan Abi Dawud 1573". */
  source: string
  kind: "quran" | "hadith" | "note"
  arabic?: string
  km: string
  en: string
}

export type ScriptureTopic = "zakat" | "riba" | "prayer" | "fasting"

export const SCRIPTURE: Record<ScriptureTopic, Citation[]> = {
  zakat: [
    {
      source: "At-Tawbah 9:103",
      kind: "quran",
      arabic: "خُذْ مِنْ أَمْوَالِهِمْ صَدَقَةً تُطَهِّرُهُمْ وَتُزَكِّيهِم بِهَا",
      km: "ចូរយកពីទ្រព្យសម្បត្តិរបស់ពួកគេជាទាន ដើម្បីសម្អាត និងធ្វើឲ្យពួកគេបរិសុទ្ធ — ហ្សាកាត់គឺជាការសម្អាតទ្រព្យ។",
      en: "Take from their wealth a charity by which you purify them and cause them to grow — zakat purifies wealth.",
    },
    {
      source: "At-Tawbah 9:60",
      kind: "quran",
      arabic: "إِنَّمَا الصَّدَقَاتُ لِلْفُقَرَاءِ وَالْمَسَاكِينِ وَالْعَامِلِينَ عَلَيْهَا …",
      km: "ហ្សាកាត់សម្រាប់តែប្រាំបីក្រុម៖ អ្នកក្រ អ្នកខ្វះខាត អ្នកប្រមូលហ្សាកាត់ អ្នកដែលចិត្តត្រូវបានបង្រួបបង្រួម ការរំដោះទាសករ អ្នកជំពាក់បំណុល ក្នុងមាគ៌ាអល់ឡោះ និងអ្នកដំណើរ។",
      en: "Zakat is only for eight groups: the poor, the needy, those who collect it, those whose hearts are being reconciled, freeing captives, those in debt, in the cause of Allah, and the stranded traveller.",
    },
    {
      source: "Sunan Abi Dawud 1573",
      kind: "hadith",
      arabic: "وَلَيْسَ فِي مَالٍ زَكَاةٌ حَتَّى يَحُولَ عَلَيْهِ الْحَوْلُ",
      km: "មាសដល់ ២០ ឌីណារ (≈ ៨៥ ក្រាម) ហើយកាន់កាប់បានគ្រប់មួយឆ្នាំចន្ទគតិ (ហាវល៍) ត្រូវបង់កន្លះឌីណារ គឺ ២,៥%។ «គ្មានហ្សាកាត់លើទ្រព្យណាមួយ រហូតដល់វាគ្រប់មួយឆ្នាំ»។",
      en: "Gold reaching 20 dinars (≈ 85 g), held for a full lunar year (hawl), owes half a dinar — 2.5%. “No zakat is due on wealth until a year has passed over it.”",
    },
    {
      source: "Sahih al-Bukhari 1395",
      kind: "hadith",
      km: "ពេលបញ្ជូនលោកមូអាហ្ស ទៅយេម៉ែន ព្យាការីបានបង្រៀនថា អល់ឡោះបានកំណត់ហ្សាកាត់ជាកាតព្វកិច្ច យកពីអ្នកមាន ហើយចែកឲ្យអ្នកក្រក្នុងចំណោមពួកគេ។",
      en: "Sending Mu'adh to Yemen, the Prophet ﷺ taught that Allah made zakat obligatory: taken from their rich and given to their poor.",
    },
    {
      source: "Nisab 85 g",
      kind: "note",
      km: "២០ ឌីណារ × ៤,២៥ ក្រាម = ៨៥ ក្រាមមាសសុទ្ធ — ការបម្លែងដែលអ្នកប្រាជ្ញសម័យទំនើបភាគច្រើនប្រើ។",
      en: "20 dinars × 4.25 g = 85 g of pure gold — the conversion most contemporary scholars use.",
    },
  ],
  riba: [
    {
      source: "Al-Baqarah 2:275",
      kind: "quran",
      arabic: "وَأَحَلَّ اللَّهُ الْبَيْعَ وَحَرَّمَ الرِّبَا",
      km: "អល់ឡោះបានអនុញ្ញាតការលក់ដូរ ហើយហាមឃាត់ការប្រាក់ (រីបា)។",
      en: "Allah has permitted trade and forbidden riba (interest).",
    },
    {
      source: "Al-Baqarah 2:276",
      kind: "quran",
      arabic: "يَمْحَقُ اللَّهُ الرِّبَا وَيُرْبِي الصَّدَقَاتِ",
      km: "អល់ឡោះលុបបំបាត់ពរជ័យនៃការប្រាក់ ហើយបង្កើនផលនៃការធ្វើទាន។",
      en: "Allah destroys riba and makes charity grow.",
    },
    {
      source: "Al-Baqarah 2:278–279",
      kind: "quran",
      arabic: "وَذَرُوا مَا بَقِيَ مِنَ الرِّبَا … فَلَكُمْ رُءُوسُ أَمْوَالِكُمْ لَا تَظْلِمُونَ وَلَا تُظْلَمُونَ",
      km: "ចូរបោះបង់ការប្រាក់ដែលនៅសល់… អ្នកមានសិទ្ធិតែលើដើមទុនរបស់អ្នកប៉ុណ្ណោះ — មិនបំពានគេ ហើយមិនត្រូវគេបំពាន។",
      en: "Give up what remains of riba… you may keep your principal — wronging no one and not being wronged.",
    },
    {
      source: "Sahih Muslim 1598",
      kind: "hadith",
      km: "ព្យាការីបានដាក់បណ្ដាសាអ្នកស៊ីការប្រាក់ អ្នកឲ្យការប្រាក់ អ្នកកត់ត្រា និងសាក្សីទាំងពីរ ហើយមានប្រសាសន៍ថា «ពួកគេដូចគ្នា»។",
      en: "The Prophet ﷺ cursed the one who consumes riba, the one who pays it, the one who records it and its two witnesses, and said: “They are all the same.”",
    },
    {
      source: "Purification",
      kind: "note",
      km: "ការប្រាក់ធនាគារដែលទទួលបានរួចហើយ អ្នកប្រាជ្ញសម័យទំនើបភាគច្រើនណែនាំឲ្យបរិច្ចាគទៅសប្បុរសធម៌ទូទៅ ដោយមិនសង្ឃឹមផលបុណ្យ និងមិនរាប់ជាហ្សាកាត់ — នេះជាមតិ (ហ្វាតវ៉ា) មិនមែនអត្ថបទគម្ពីរផ្ទាល់ទេ។",
      en: "For bank interest already received, most contemporary scholars advise giving it to general welfare without expecting reward and without counting it as zakat — this is a scholarly opinion (fatwa), not a direct scriptural text.",
    },
  ],
  prayer: [
    {
      source: "An-Nisa 4:103",
      kind: "quran",
      arabic: "إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَّوْقُوتًا",
      km: "ពិតប្រាកដណាស់ សឡាតគឺជាកាតព្វកិច្ចលើអ្នកមានជំនឿ តាមពេលវេលាដែលបានកំណត់។",
      en: "Indeed, prayer has been decreed upon the believers at fixed times.",
    },
    {
      source: "Sunan Abi Dawud 393 · Jami' at-Tirmidhi 149",
      kind: "hadith",
      km: "ម៉ាឡាអ៊ីកាត់ជីព្រីល បាននាំព្យាការីសឡាតពីរថ្ងៃ ដើម្បីបង្ហាញពេលចាប់ផ្ដើម និងពេលចុងក្រោយនៃសឡាតនីមួយៗ។",
      en: "Jibril led the Prophet ﷺ in prayer on two days to show the start and the end of each prayer's time.",
    },
    {
      source: "Method",
      kind: "note",
      km: "ការគណនា៖ ស៊ូពុហ៍ ពេលព្រះអាទិត្យនៅក្រោមជើងមេឃ ២០°, អ៊ីស្យា ១៨°, អាសារ តាមមាសហាប់សាហ្វីអ៊ី (ស្រមោល = ១ ដងនៃកម្ពស់) និងបន្ថែម ២ នាទីប្រុងប្រយ័ត្ន — វិធីដែលប្រតិទិនក្នុងតំបន់ (ម៉ាឡេស៊ី សិង្ហបុរី) ប្រើ។ មិនមែនជាប្រតិទិនផ្លូវការរបស់មូហ្វទីកម្ពុជាទេ — សូមផ្ទៀងផ្ទាត់ជាមួយម៉ាស្ជិទ ឬមូហ្វទីក្នុងស្រុក។",
      en: "Calculation: Fajr at 20° below the horizon, Isha at 18°, Shafi'i Asr (shadow = 1× height) and a 2-minute safety margin — the method the regional (Malaysia, Singapore) calendars use. This is not an official Mufti of Cambodia timetable — please check it against your local mosque or Mufti.",
    },
  ],
  fasting: [
    {
      source: "Al-Baqarah 2:187",
      kind: "quran",
      arabic: "وَكُلُوا وَاشْرَبُوا حَتَّىٰ يَتَبَيَّنَ لَكُمُ الْخَيْطُ الْأَبْيَضُ مِنَ الْخَيْطِ الْأَسْوَدِ مِنَ الْفَجْرِ ثُمَّ أَتِمُّوا الصِّيَامَ إِلَى اللَّيْلِ",
      km: "ចូរបរិភោគ និងផឹក រហូតដល់ខ្សែពណ៌សបែកចេញពីខ្សែពណ៌ខ្មៅនៃអរុណោទ័យ (ហ្វាជរ) ហើយបន្តការតមរហូតដល់យប់ (ម៉ាហ្គ្រិប)។",
      en: "Eat and drink until the white thread of dawn becomes distinct from the black thread, then complete the fast until nightfall.",
    },
    {
      source: "Imsak",
      kind: "note",
      km: "អ៊ិមសាក់ = ១០ នាទីមុនស៊ូពុហ៍ ជាការប្រុងប្រយ័ត្នតាមទម្លាប់អាស៊ីអាគ្នេយ៍។ ការតមចាប់ផ្ដើមពិតប្រាកដនៅពេលស៊ូពុហ៍ ហើយបើកបួសនៅពេលម៉ាហ្គ្រិប។",
      en: "Imsak = 10 minutes before Fajr, a precaution customary in Southeast Asia. The fast itself begins at Fajr and is broken at Maghrib.",
    },
  ],
}
