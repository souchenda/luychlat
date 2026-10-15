import { redirect } from "next/navigation"

/** /vehicles — the menu's «ឯកសារយានយន្ត»: the vehicle documents live on /car (inspection, road tax, insurance). */
export default function VehiclesPage() {
  redirect("/car")
}
