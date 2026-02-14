# Smart Chat Bot - Code Standards

## TypeScript Configuration

All code uses **TypeScript strict mode** for maximum type safety:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "skipLibCheck": true,
    "esModuleInterop": true
  }
}
```

**Key Rules:**
- All functions and variables must have explicit type annotations
- No `any` type without `// @ts-expect-error` comment
- Use `unknown` instead of `any` for untyped values
- Export types explicitly: `export interface`, `export type`

## File Naming Conventions

### TypeScript/JavaScript Files

Use **kebab-case** with descriptive names:

```
✓ chat-routes.ts
✓ claudible-client.ts
✓ embeddings-service.ts
✓ use-chat.ts
✗ ChatRoutes.ts
✗ claudibleClient.ts
```

### Directory Structure

Organize by concern, not by type:

```
src/
├── routes/           # Route handlers
├── services/         # Business logic
├── db/               # Database layer
├── config/           # Configuration
└── types/            # Type definitions
```

### Naming Patterns

| Pattern | Example | Usage |
|---------|---------|-------|
| `*-routes.ts` | `chat-routes.ts` | Hono route definitions |
| `*-client.ts` | `claudible-client.ts` | External service clients |
| `*-service.ts` | `rag-service.ts` | Business logic services |
| `use-*.ts` | `use-chat.ts` | Preact hooks |
| `*-button.tsx` | `cart-button.tsx` | Preact components |
| `types.ts` or `index.ts` | `types.ts` | Type definitions |

## Code Structure Patterns

### Service Classes (Backend)

Create factory functions and class exports:

```typescript
// embeddings-service.ts
export class EmbeddingsService {
  constructor(private apiKey: string) {}

  async embed(text: string): Promise<number[]> {
    // Implementation
  }
}

export function createEmbeddingsService(apiKey: string): EmbeddingsService {
  return new EmbeddingsService(apiKey);
}
```

**Benefits:**
- Testable (inject dependencies)
- Type-safe (class methods are typed)
- Composable (services depend on services)

### Route Handlers (Hono)

Structure route handlers with validation and error handling:

```typescript
const chatRoutes = new Hono<{ Bindings: Env; Variables: ContextVariables }>();

chatRoutes.post('/', async (c) => {
  // 1. Extract context
  const tenantId = c.get('tenantId');

  // 2. Parse & validate request
  let body: ChatRequest;
  try {
    body = await c.req.json<ChatRequest>();
  } catch {
    return c.json(createErrorResponse('Invalid JSON'), 400);
  }

  if (!body.messages?.length) {
    return c.json(createErrorResponse('Missing messages'), 400);
  }

  // 3. Execute business logic
  try {
    const result = await chatService.process(body);
    return c.json(createSuccessResponse(result));
  } catch (error) {
    console.error('Error:', error);
    return c.json(createErrorResponse(getErrorMessage(error)), 500);
  }
});
```

**Pattern:**
1. Extract context (tenantId, user, etc)
2. Parse and validate request body
3. Execute business logic in try/catch
4. Return standardized response

### Preact Components

Use functional components with hooks:

```typescript
// chat-messages.tsx
interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div class="messages" ref={ref}>
      {messages.map((msg) => (
        <div key={msg.id} class={`message ${msg.role}`}>
          {msg.content}
        </div>
      ))}
      {isLoading && <div class="loading">Typing...</div>}
    </div>
  );
}
```

**Rules:**
- Component names in PascalCase
- Props interface suffixed with `Props`
- Use `useRef` for DOM access
- Extract complex logic to custom hooks

## Error Handling

### Backend Error Pattern

Create error responses with context:

```typescript
// responses.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export function createSuccessResponse<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

export function createErrorResponse(error: string): ApiResponse<null> {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
  };
}
```

### Try-Catch Blocks

Always catch and log errors:

```typescript
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('Operation failed:', error);

  const message = error instanceof Error ? error.message : 'Unknown error';
  throw new Error(`Failed to process: ${message}`);
}
```

### Database Error Handling

```typescript
try {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  return data;
} catch (error) {
  console.error('Query failed:', error);
  throw error;
}
```

## Testing Requirements

### Unit Test Pattern

```typescript
// rag-service.test.ts
describe('RAGService', () => {
  let ragService: RAGService;
  let mockSupabase: Mock<SupabaseClient>;

  beforeEach(() => {
    mockSupabase = createMockSupabaseClient();
    ragService = new RAGService(mockSupabase);
  });

  test('searchDocuments returns ranked results', async () => {
    const results = await ragService.searchDocuments(
      'test query',
      'tenant-1',
      3
    );

    expect(results).toHaveLength(3);
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });
});
```

**Coverage Requirements:**
- Unit tests for all services (>80%)
- Integration tests for API routes
- Error scenarios must be tested
- Edge cases (empty inputs, null values, etc)

## API Design

### Endpoint Naming

Use RESTful conventions:

```
POST   /api/chat          # Create/send message
GET    /api/chat/:id      # Retrieve session
DELETE /api/chat/:id      # Delete session

POST   /api/chat/agent    # Agent mode
POST   /api/chat/sync     # Sync mode

GET    /health            # Health check
```

### Request/Response Format

All APIs use JSON with standard envelope:

```json
{
  "success": true,
  "data": { /* actual response */ },
  "timestamp": "2026-02-15T12:00:00Z"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad request (validation error)
- `401` - Unauthorized
- `403` - Forbidden (tenant isolation)
- `404` - Not found
- `500` - Server error

### Request Validation

Validate all input at route handler:

```typescript
// Validate types
if (!Array.isArray(body.messages)) {
  return c.json(createErrorResponse('messages must be array'), 400);
}

// Validate content
if (body.messages.length === 0) {
  return c.json(createErrorResponse('messages cannot be empty'), 400);
}

// Validate structure
const invalid = body.messages.find(
  (m) => !m.role || !['user', 'assistant'].includes(m.role)
);
if (invalid) {
  return c.json(createErrorResponse('Invalid message format'), 400);
}
```

## Multi-Tenant Isolation

### Data Access Pattern

Always filter by tenant_id:

```typescript
async function getDocuments(
  supabase: SupabaseClient,
  tenantId: string
): Promise<Document[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('tenant_id', tenantId);  // ← Always filter!

  if (error) throw new Error(error.message);
  return data || [];
}
```

### Header Validation

All `/api/*` routes check X-Tenant-ID:

```typescript
app.use('/api/*', async (c, next) => {
  const tenantId = c.get('tenantId');
  if (!tenantId) {
    return c.json(createErrorResponse('X-Tenant-ID header required'), 400);
  }
  await next();
});
```

## Documentation Standards

### Function Documentation

Use JSDoc for public functions:

```typescript
/**
 * Search for similar documents using vector embedding
 *
 * @param embedding - Vector to search for (1536 dimensions)
 * @param tenantId - Filter results to this tenant
 * @param limit - Maximum results to return (default: 5)
 * @param threshold - Minimum similarity score (0-1, default: 0.75)
 * @returns Promise of documents ranked by similarity
 */
export async function searchDocuments(
  embedding: number[],
  tenantId: string,
  limit: number = 5,
  threshold: number = 0.75
): Promise<Document[]> {
  // Implementation
}
```

### Inline Comments

Comment WHY, not WHAT:

```typescript
// GOOD: Explains the reason
// Exclude embeddings from response to reduce payload size
const { data } = await supabase
  .from('documents')
  .select('id, content, metadata')  // Don't select 'embedding'
  .eq('tenant_id', tenantId);

// BAD: Restates what code does
// Select id, content, metadata from documents
const { data } = await supabase.from('documents').select('id, content, metadata');
```

### File Headers

Include purpose at top of file:

```typescript
/**
 * Chat Route Handlers
 *
 * Implements chat endpoints with streaming and agent modes:
 * - POST /api/chat - Basic streaming chat
 * - POST /api/chat/sync - Synchronous response
 * - POST /api/chat/agent - Agent with tool calling
 * - POST /api/chat/agent/stream - Agent with streaming
 */
```

## Performance Guidelines

### Query Optimization

- Use indexes for frequent filters (tenant_id, session_id)
- Fetch only required columns
- Use pgvector operator `<=>` for distance (not `<->`)

```typescript
// GOOD: Uses distance operator with LIMIT
const { data } = await supabase.rpc('search_vectors', {
  query_embedding: embedding,
  tenant_id: tenantId,
  limit: 5,
  threshold: 0.75
});

// BAD: Fetches all, filters in memory
const { data } = await supabase.from('documents').select('*');
const filtered = data.filter(d => d.tenant_id === tenantId);
```

### Bundle Size

Keep dependencies minimal:
- **Widget:** <100KB gzipped
- **Preact:** Already minimal (8KB)
- Avoid large polyfills for modern browsers (ES2022)

### Concurrency

Use Promise.all for independent operations:

```typescript
// GOOD: Parallel execution
const [tenant, documents, cart] = await Promise.all([
  tenantService.load(tenantId),
  ragService.search(embedding),
  cartService.get(cartId),
]);

// BAD: Sequential execution
const tenant = await tenantService.load(tenantId);
const documents = await ragService.search(embedding);
const cart = await cartService.get(cartId);
```

## Security Guidelines

### Secrets Management

Never commit secrets:

```typescript
// GOOD: Read from environment
const apiKey = c.env.VOYAGE_API_KEY;

// BAD: Hardcoded
const apiKey = 'sk-abc123...';
```

### Input Validation

Always validate external input:

```typescript
if (!isValidEmail(user.email)) {
  throw new Error('Invalid email format');
}

if (sessionId && !isValidUUID(sessionId)) {
  throw new Error('Invalid session ID format');
}
```

### CORS Configuration

Allow widget embedding but restrict API:

```typescript
app.use(
  '*',
  cors({
    origin: '*',  // Widget embeds on any domain
    allowHeaders: ['Content-Type', 'X-Tenant-ID'],
    credentials: false,  // No cookies sent
  })
);
```

## Commit Message Format

Use conventional commits:

```
feat: add product search tool to agent
fix: handle null values in RAG similarity search
docs: update API documentation
refactor: extract tenant validation to middleware
chore: update dependencies
```

**Format:** `<type>: <description>`

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `refactor` - Code refactoring
- `chore` - Dependencies, tooling
- `test` - Tests

---

**Last Updated:** February 15, 2026
**Version:** 1.0
