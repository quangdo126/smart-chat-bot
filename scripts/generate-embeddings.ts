/**
 * Generate embeddings for all products and FAQs using Voyage AI
 * Run with: npx tsx scripts/generate-embeddings.ts
 */

// Configuration
const VOYAGE_API_KEY = 'pa-ecdt9CeYbmKtOT5X2f2qo4MxrhOcIONNPU4Dz-eDY4r'
const SUPABASE_URL = 'https://fzkmwvweijgujxienphc.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6a213dndlaWpndWp4aWVucGhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTA2MzU2NCwiZXhwIjoyMDg2NjM5NTY0fQ.vkvVanysEF6dbRgHMCBkoGioKxuU2Ytn2U_O4IVoZ8M'

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings'
const VOYAGE_MODEL = 'voyage-4-large' // 1024 dimensions
const MAX_BATCH_SIZE = 128

interface VoyageResponse {
  data: Array<{ embedding: number[]; index: number }>
  model: string
  usage: { total_tokens: number }
}

interface Product {
  id: string
  title: string
  description: string | null
}

interface Faq {
  id: string
  question: string
  answer: string
}

async function callVoyageApi(texts: string[]): Promise<number[][]> {
  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: 'document',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Voyage API error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as VoyageResponse
  console.log(`  Voyage API: ${data.usage.total_tokens} tokens used`)

  // Return embeddings in order
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding)
}

async function supabaseQuery<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`
  const response = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.method === 'PATCH' ? 'return=minimal' : 'return=representation',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Supabase error ${response.status}: ${errorText}`)
  }

  if (options.method === 'PATCH') {
    return {} as T
  }

  return response.json() as Promise<T>
}

async function processProducts(): Promise<void> {
  console.log('\n=== Processing Products ===')

  // Fetch products with NULL embedding
  const products = await supabaseQuery<Product[]>(
    'products?select=id,title,description&embedding=is.null'
  )

  console.log(`Found ${products.length} products without embeddings`)

  if (products.length === 0) {
    console.log('No products to process')
    return
  }

  // Process in batches
  for (let i = 0; i < products.length; i += MAX_BATCH_SIZE) {
    const batch = products.slice(i, i + MAX_BATCH_SIZE)
    console.log(`\nProcessing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}/${Math.ceil(products.length / MAX_BATCH_SIZE)}`)

    // Create text for each product: "title. description"
    const texts = batch.map((p) => {
      const desc = p.description?.trim() || ''
      return `${p.title}${desc ? '. ' + desc : ''}`
    })

    // Get embeddings from Voyage AI
    const embeddings = await callVoyageApi(texts)

    // Update each product
    for (let j = 0; j < batch.length; j++) {
      const product = batch[j]
      const embedding = embeddings[j]

      await supabaseQuery(
        `products?id=eq.${product.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ embedding }),
        }
      )
      console.log(`  Updated product: ${product.title.substring(0, 50)}...`)
    }
  }

  console.log(`\nCompleted: ${products.length} products updated`)
}

async function processFaqs(): Promise<void> {
  console.log('\n=== Processing FAQs ===')

  // Fetch FAQs with NULL embedding
  const faqs = await supabaseQuery<Faq[]>(
    'faqs?select=id,question,answer&embedding=is.null'
  )

  console.log(`Found ${faqs.length} FAQs without embeddings`)

  if (faqs.length === 0) {
    console.log('No FAQs to process')
    return
  }

  // Process in batches
  for (let i = 0; i < faqs.length; i += MAX_BATCH_SIZE) {
    const batch = faqs.slice(i, i + MAX_BATCH_SIZE)
    console.log(`\nProcessing batch ${Math.floor(i / MAX_BATCH_SIZE) + 1}/${Math.ceil(faqs.length / MAX_BATCH_SIZE)}`)

    // Create text for each FAQ: "question answer"
    const texts = batch.map((f) => `${f.question} ${f.answer}`)

    // Get embeddings from Voyage AI
    const embeddings = await callVoyageApi(texts)

    // Update each FAQ
    for (let j = 0; j < batch.length; j++) {
      const faq = batch[j]
      const embedding = embeddings[j]

      await supabaseQuery(
        `faqs?id=eq.${faq.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ embedding }),
        }
      )
      console.log(`  Updated FAQ: ${faq.question.substring(0, 50)}...`)
    }
  }

  console.log(`\nCompleted: ${faqs.length} FAQs updated`)
}

async function main(): Promise<void> {
  console.log('=================================')
  console.log('Embedding Generation Script')
  console.log('=================================')
  console.log(`Model: ${VOYAGE_MODEL} (1024 dimensions)`)
  console.log(`Batch size: ${MAX_BATCH_SIZE}`)

  try {
    await processProducts()
    await processFaqs()

    console.log('\n=================================')
    console.log('All embeddings generated successfully!')
    console.log('=================================')
  } catch (error) {
    console.error('\nError:', error)
    process.exit(1)
  }
}

main()
