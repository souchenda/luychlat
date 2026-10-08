/**
 * The Khmer closing blessing for a family / festival shared pool — gratitude for
 * the families' unity and shared merit, wishes of health and prosperity, and the
 * customary request for forgiveness. One text for the bot's closing post and the
 * pool page.
 */
export const CLOSING_BLESSING = [
  "🙏 សូមអរគុណគ្រប់គ្រួសារ ដែលបានរួមចំណែកដោយសាមគ្គីភាព ធ្វើឱ្យបុណ្យកុសលនេះបានសម្រេច និងទទួលបានផលបុណ្យស្មើៗគ្នា។",
  "សូមជូនពរគ្រប់គ្រួសារ រកទទួលទានមានបាន ចម្រុងចម្រើន មានសុខភាពល្អ និងសុខសាន្តជានិច្ច។ សង្ឃឹមថានឹងបានជួបជុំគ្នាម្ដងទៀត ក្នុងពិធីបុណ្យឆ្នាំក្រោយ។",
  "ប្រសិនបើមានការខ្វះខាតណាមួយក្នុងការចាត់ចែង ដោយអចេតនា សូមមេត្តាអភ័យទោស និងខន្តីផងចុះ។",
].join("\n\n")

/** Pools that close with the blessing: family shares, festivals, the Pchum Ben template. */
export const takesBlessing = (p: { unit?: string | null; kind?: string | null; template?: string | null }) =>
  p.unit === "FAMILY" || p.kind === "FESTIVAL" || p.template === "pchumben"
