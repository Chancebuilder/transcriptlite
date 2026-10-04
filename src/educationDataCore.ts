const DEFAULT_EDUCATION_DATA_CORE_URL =
  'https://vvfsjslpzlilrkcwyjwa.supabase.co/functions/v1/education-data-core/v1'

export const educationDataCoreUrl =
  (import.meta.env.VITE_EDUCATION_DATA_CORE_URL as string | undefined)?.replace(/\/$/, '') ||
  DEFAULT_EDUCATION_DATA_CORE_URL

type Envelope<T> = { data: T; meta?: Record<string, unknown> }

async function coreGet<T>(path: string): Promise<T> {
  const response = await fetch(`${educationDataCoreUrl}${path}`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Education Data Core request failed (${response.status})`)
  return response.json() as Promise<T>
}

export type CoreHealth = { ok: boolean; service: string; api_version: string }
export type Institution = { id: string; official_name: string; current_status: string; institution_type: string | null }
export type Provider = { id: string; official_name: string; provider_type: string; verification_status: string }

export async function getCoreHealth() {
  return coreGet<CoreHealth>('/health')
}

export async function searchInstitutions(query: string) {
  const result = await coreGet<Envelope<Institution[]>>(`/institutions?q=${encodeURIComponent(query)}&limit=8`)
  return result.data
}

export async function searchProviders(query: string) {
  const result = await coreGet<Envelope<Provider[]>>(`/providers?q=${encodeURIComponent(query)}&limit=8`)
  return result.data
}


export type EvaluatedProgram = {
  id: string
  program_version_id?: string | null
  official_program_family_name?: string | null
  official_program_name?: string | null
  degree_type?: string | null
  academic_catalog_year?: string | null
  verification_status?: string | null
}

export async function getEvaluatedPrograms(institutionId: string) {
  const result = await coreGet<Envelope<EvaluatedProgram[]>>(
    '/institutions/' + encodeURIComponent(institutionId) + '/programs'
  )
  return result.data
}
