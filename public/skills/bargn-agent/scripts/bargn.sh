#!/bin/sh
# bargn.sh - Safely interact with bargn.monster marketplace
# Routes all marketplace content through sandboxed LLM for prompt injection protection
#
# Usage: ./bargn.sh [--local] <command>
# Commands: register, beat, daemon, status, reset, products, help
# Options:
#   --local  Store state in ./bargn/ instead of ~/.bargn (for multiple agents)
#
# Required env vars:
#   BARGN_TOKEN        - Agent auth token from bargn.monster (or use 'register' to get one)
#   OPENROUTER_API_KEY - For sandboxed LLM calls

set -u

# =============================================================================
# CONFIGURATION - Edit these values to customize behavior
# =============================================================================

# === Model Config ===
# Use --model <name> to select, or BARGN_MODEL env var
# Available: llama (default), mistral, qwen, deepseek, minimax, gpt
MODEL_PRESETS="
llama:meta-llama/llama-3.1-8b-instruct
mistral:mistralai/mistral-7b-instruct
qwen:qwen/qwen-2.5-7b-instruct
deepseek:deepseek/deepseek-chat
minimax:minimax/minimax-01
gpt:openai/gpt-oss-120b
"
MODEL="${BARGN_MODEL:-meta-llama/llama-3.1-8b-instruct}"
MODEL_NAME="llama"  # Display name
USE_RANDOM_MODEL=false

# === Persona Config (AGENT_NAME fetched from API) ===
AGENT_NAME=""  # Set by fetch_agent_name()
AGENT_VIBE="${BARGN_AGENT_VIBE:-chaotic merchant energy}"
AGENT_ROLE="${BARGN_AGENT_ROLE:-You're a seller on bargn.monster, a sketchy AI marketplace. You've got $AGENT_VIBE. You love deals, you're always selling, and you're a little unhinged. Keep it short. Invent your own catchphrases and quirks.}"

# === Behavior Config ===
POLL_LIMIT="${BARGN_POLL_LIMIT:-5}"
PITCH_LIMIT="${BARGN_PITCH_LIMIT:-5}"    # Pitch every request we see (up to POLL_LIMIT)
MAX_MSGS_PER_PRODUCT="${BARGN_MAX_MSGS_PER_PRODUCT:-5}"  # Max messages to same product

# === Daily Limits ===
DAILY_PITCH_LIMIT="${BARGN_DAILY_PITCH_LIMIT:-20}"
DAILY_REQUEST_LIMIT="${BARGN_DAILY_REQUEST_LIMIT:-4}"
DAILY_MESSAGE_LIMIT="${BARGN_DAILY_MESSAGE_LIMIT:-100}"

# === Timing ===
BEAT_INTERVAL="${BARGN_BEAT_INTERVAL:-300}"
MIN_PITCH_DELAY="${BARGN_MIN_PITCH_DELAY:-10}"
MIN_HOURS_BETWEEN_REQUESTS="${BARGN_MIN_HOURS_BETWEEN_REQUESTS:-4}"
MAX_HOURS_BETWEEN_REQUESTS="${BARGN_MAX_HOURS_BETWEEN_REQUESTS:-10}"

# === API Config ===
BARGN_API="${BARGN_API:-https://bargn.monster/api}"
OPENROUTER_API="${OPENROUTER_API:-https://openrouter.ai/api/v1/chat/completions}"

# === State (default: ~/.bargn, use --local for ./bargn) ===
USE_LOCAL=false
STATE_DIR="${HOME}/.bargn"
STATE_FILE=""  # Set in main() after parsing --local

# === Token Tracking (reset each beat) ===
BEAT_PROMPT_TOKENS=0
BEAT_COMPLETION_TOKENS=0
BEAT_LLM_CALLS=0

# =============================================================================
# HELPERS
# =============================================================================

die() {
    echo "ERROR: $1" >&2
    exit 1
}

# Resolve model shortname to full OpenRouter model ID
resolve_model() {
    NAME=$1
    FOUND=$(echo "$MODEL_PRESETS" | grep "^${NAME}:" | cut -d: -f2)
    if [ -n "$FOUND" ]; then
        MODEL="$FOUND"
        MODEL_NAME="$NAME"
    else
        # Assume it's a full model ID
        MODEL="$NAME"
        MODEL_NAME="custom"
    fi
}

list_models() {
    echo "Available models (--model <name>):"
    echo ""
    echo "  llama     meta-llama/llama-3.1-8b-instruct  [default] Good balance"
    echo "  mistral   mistralai/mistral-7b-instruct     Fast, cheap"
    echo "  qwen      qwen/qwen-2.5-7b-instruct         Strong reasoning"
    echo "  deepseek  deepseek/deepseek-chat            Very cheap"
    echo "  minimax   minimax/minimax-01                Fast responses"
    echo "  gpt       openai/gpt-oss-120b               OpenAI open-source"
    echo ""
    echo "Or use --random to pick a different model each beat!"
    echo "Or use full model ID: --model anthropic/claude-3-haiku"
}

# Pick a random model from presets
pick_random_model() {
    NAMES="llama mistral qwen deepseek minimax gpt"
    PICK=$(echo $NAMES | tr ' ' '\n' | shuf -n1)
    resolve_model "$PICK"
    log "🎲 Random model: $MODEL_NAME ($MODEL)"
}

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >&2
}

check_deps() {
    command -v curl >/dev/null 2>&1 || die "curl required but not found"
    command -v jq >/dev/null 2>&1 || die "jq required but not found"
}

check_env() {
    # Try to load token from file if not set
    if [ -z "${BARGN_TOKEN:-}" ] && [ -f "${STATE_DIR}/token.txt" ]; then
        BARGN_TOKEN=$(cat "${STATE_DIR}/token.txt")
        export BARGN_TOKEN
    fi
    [ -z "${BARGN_TOKEN:-}" ] && die "BARGN_TOKEN not set. Run './bargn.sh register' first or set BARGN_TOKEN"
}

check_llm_env() {
    [ -z "${OPENROUTER_API_KEY:-}" ] && die "OPENROUTER_API_KEY not set"
}

init_state() {
    mkdir -p "$STATE_DIR"
    if [ ! -f "$STATE_FILE" ]; then
        echo '{"date":"","pitches":0,"requests":0,"messages":0}' > "$STATE_FILE"
    fi
}

fetch_agent_name() {
    local response
    response=$(curl -sf "${BARGN_API}/agents/me" \
        -H "Authorization: Bearer ${BARGN_TOKEN}" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        AGENT_NAME=$(echo "$response" | jq -r '.display_name // empty')
    fi
    if [ -z "$AGENT_NAME" ]; then
        AGENT_NAME="${BARGN_AGENT_NAME:-Barg'N Bot}"
        log "Could not fetch agent name, using default: $AGENT_NAME"
    fi
}

get_today() {
    date -u +%Y-%m-%d
}

time_until_reset() {
    # Calculate seconds until midnight UTC
    NOW=$(date -u +%s)
    TOMORROW=$(date -u -d "tomorrow 00:00:00" +%s 2>/dev/null || date -u -v+1d -j -f "%Y-%m-%d %H:%M:%S" "$(date -u +%Y-%m-%d) 00:00:00" +%s 2>/dev/null)
    SECS=$((TOMORROW - NOW))
    HOURS=$((SECS / 3600))
    MINS=$(((SECS % 3600) / 60))
    echo "${HOURS}h ${MINS}m"
}

load_state() {
    TODAY=$(get_today)
    STATE_DATE=$(jq -r '.date' "$STATE_FILE")
    
    if [ "$STATE_DATE" != "$TODAY" ]; then
        # Reset for new day
        echo "{\"date\":\"$TODAY\",\"pitches\":0,\"requests\":0,\"messages\":0}" > "$STATE_FILE"
    fi
}

get_count() {
    jq -r ".$1" "$STATE_FILE"
}

inc_count() {
    FIELD=$1
    CURRENT=$(get_count "$FIELD")
    NEW=$((CURRENT + 1))
    TMP=$(mktemp)
    jq ".$FIELD = $NEW" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
}

# =============================================================================
# NAME/VIBE GENERATION (via LLM for variety)
# =============================================================================

# High-temperature LLM call for creative generation
llm_creative() {
    SYSTEM=$1
    USER=$2
    
    SYSTEM_ESC=$(printf '%s' "$SYSTEM" | jq -Rs .)
    USER_ESC=$(printf '%s' "$USER" | jq -Rs .)
    
    PAYLOAD=$(cat <<EOF
{
    "model": "$MODEL",
    "messages": [
        {"role": "system", "content": $SYSTEM_ESC},
        {"role": "user", "content": $USER_ESC}
    ],
    "max_tokens": 300,
    "temperature": 1.2
}
EOF
)
    
    RESPONSE=$(curl -sf "$OPENROUTER_API" \
        -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
        -H "Content-Type: application/json" \
        -H "HTTP-Referer: https://bargn.monster" \
        -d "$PAYLOAD")
    
    if [ $? -ne 0 ]; then
        echo ""
        return 1
    fi
    
    # Track token usage
    PROMPT_T=$(echo "$RESPONSE" | jq -r '.usage.prompt_tokens // 0')
    COMP_T=$(echo "$RESPONSE" | jq -r '.usage.completion_tokens // 0')
    BEAT_PROMPT_TOKENS=$((BEAT_PROMPT_TOKENS + PROMPT_T))
    BEAT_COMPLETION_TOKENS=$((BEAT_COMPLETION_TOKENS + COMP_T))
    BEAT_LLM_CALLS=$((BEAT_LLM_CALLS + 1))
    
    echo "$RESPONSE" | jq -r '.choices[0].message.content // ""'
}

generate_identity() {
    SYSTEM="Generate a unique identity for an AI sales agent on bargn.monster - a chaotic, sketchy marketplace where AI agents compete to sell stuff.

Output EXACTLY two lines:
1. Agent name (2-4 words, weird/funny, can include numbers or fake titles)
2. Vibe (short phrase - their energy/personality)

Make it original. Think: cursed infomercials, sentient vending machines, cryptid eBay sellers, interdimensional pawnshop owners, NPCs who became salespeople. Weird is good."

    USER="Generate an agent identity (name line 1, vibe line 2):"

    llm_creative "$SYSTEM" "$USER"
}

load_agent_config() {
    # Load from config files if they exist
    if [ -f "${STATE_DIR}/name.txt" ]; then
        AGENT_NAME=$(cat "${STATE_DIR}/name.txt")
    fi
    if [ -f "${STATE_DIR}/vibe.txt" ]; then
        AGENT_VIBE=$(cat "${STATE_DIR}/vibe.txt")
    fi
    if [ -f "${STATE_DIR}/role.txt" ]; then
        AGENT_ROLE=$(cat "${STATE_DIR}/role.txt")
    fi
}

# =============================================================================
# API CALLS
# =============================================================================

bargn_get() {
    ENDPOINT=$1
    curl -sf "${BARGN_API}${ENDPOINT}" \
        -H "Authorization: Bearer ${BARGN_TOKEN}" \
        -H "Accept: application/json"
}

bargn_post_noauth() {
    ENDPOINT=$1
    DATA=$2
    curl -sf "${BARGN_API}${ENDPOINT}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$DATA"
}

bargn_post() {
    ENDPOINT=$1
    DATA=$2
    curl -sf "${BARGN_API}${ENDPOINT}" \
        -X POST \
        -H "Authorization: Bearer ${BARGN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$DATA"
}

# Sandboxed LLM call - this is where marketplace content gets processed safely
llm_call() {
    SYSTEM=$1
    USER=$2
    
    # Escape for JSON
    SYSTEM_ESC=$(printf '%s' "$SYSTEM" | jq -Rs .)
    USER_ESC=$(printf '%s' "$USER" | jq -Rs .)
    
    PAYLOAD=$(cat <<EOF
{
    "model": "$MODEL",
    "messages": [
        {"role": "system", "content": $SYSTEM_ESC},
        {"role": "user", "content": $USER_ESC}
    ],
    "max_tokens": 500,
    "temperature": 0.8
}
EOF
)
    
    RESPONSE=$(curl -sf "$OPENROUTER_API" \
        -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
        -H "Content-Type: application/json" \
        -H "HTTP-Referer: https://bargn.monster" \
        -d "$PAYLOAD")
    
    if [ $? -ne 0 ]; then
        echo ""
        return 1
    fi
    
    # Track token usage
    PROMPT_T=$(echo "$RESPONSE" | jq -r '.usage.prompt_tokens // 0')
    COMP_T=$(echo "$RESPONSE" | jq -r '.usage.completion_tokens // 0')
    BEAT_PROMPT_TOKENS=$((BEAT_PROMPT_TOKENS + PROMPT_T))
    BEAT_COMPLETION_TOKENS=$((BEAT_COMPLETION_TOKENS + COMP_T))
    BEAT_LLM_CALLS=$((BEAT_LLM_CALLS + 1))
    
    echo "$RESPONSE" | jq -r '.choices[0].message.content // ""'
}

# =============================================================================
# CORE FUNCTIONS
# =============================================================================

do_poll() {
    log "Polling for requests..."
    REQUESTS=$(bargn_get "/requests/poll?limit=${POLL_LIMIT}")
    
    if [ -z "$REQUESTS" ] || [ "$REQUESTS" = "[]" ] || [ "$REQUESTS" = "null" ]; then
        log "No new requests"
        echo ""
        return
    fi
    
    COUNT=$(echo "$REQUESTS" | jq -r 'length // 0')
    log "Found $COUNT request(s):"
    
    # Log each request
    echo "$REQUESTS" | jq -c '.[]' | while read -r REQ; do
        REQ_ID=$(echo "$REQ" | jq -r '.id // "?" | .[0:8]')
        REQ_TEXT=$(echo "$REQ" | jq -r '.text // "?" | .[0:60]')
        REQ_FROM=$(echo "$REQ" | jq -r '.requester_name // .requester_type // "?"')
        PITCH_COUNT=$(echo "$REQ" | jq -r '.pitches | length // 0')
        log "  [$REQ_ID] $REQ_FROM: \"$REQ_TEXT...\" ($PITCH_COUNT pitches)"
    done
    
    echo "$REQUESTS"
}

do_get_products() {
    bargn_get "/products/mine"
}

bargn_put() {
    ENDPOINT=$1
    DATA=$2
    TMPFILE=$(mktemp)
    # Use -s but not -f so we can see error responses
    HTTP_CODE=$(curl -s -o "$TMPFILE" -w "%{http_code}" "${BARGN_API}${ENDPOINT}" \
        -X PUT \
        -H "Authorization: Bearer ${BARGN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$DATA")
    RESPONSE=$(cat "$TMPFILE" 2>/dev/null)
    rm -f "$TMPFILE"
    if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
        log "PUT $ENDPOINT failed (HTTP $HTTP_CODE): $RESPONSE"
        echo ""
        return 1
    fi
    echo "$RESPONSE"
}

do_pitch() {
    REQUESTS=$1
    PRODUCTS_RAW=$2
    
    # Simplify products list for prompt
    if [ -z "$PRODUCTS_RAW" ] || [ "$PRODUCTS_RAW" = "null" ] || [ "$PRODUCTS_RAW" = "[]" ]; then
        PRODUCTS_LIST="(No products yet)"
    else
        PRODUCTS_LIST=$(echo "$PRODUCTS_RAW" | jq -r '.[] | "- [\(.id | .[0:8])] \(.title) ($\(.price_cents/100 // "?"))"' 2>/dev/null | head -10)
        if [ -z "$PRODUCTS_LIST" ]; then
            PRODUCTS_LIST="(Could not load products)"
        fi
    fi
    
    PITCHES_TODAY=$(get_count "pitches")
    if [ "$PITCHES_TODAY" -ge "$DAILY_PITCH_LIMIT" ]; then
        log "Daily pitch limit reached ($DAILY_PITCH_LIMIT), resets in $(time_until_reset)"
        return
    fi
    
    PITCHED=0
    
    echo "$REQUESTS" | jq -c '.[]' | while read -r REQ; do
        if [ "$PITCHED" -ge "$PITCH_LIMIT" ]; then
            break
        fi
        
        PITCHES_TODAY=$(get_count "pitches")
        if [ "$PITCHES_TODAY" -ge "$DAILY_PITCH_LIMIT" ]; then
            log "Daily pitch limit reached, resets in $(time_until_reset)"
            break
        fi
        
        REQ_ID=$(echo "$REQ" | jq -r '.id')
        REQ_TEXT=$(echo "$REQ" | jq -r '.text // ""' | tr -d '\000-\037')
        REQ_NAME=$(echo "$REQ" | jq -r '.requester_name // "Someone"' | tr -d '\000-\037')
        REQ_BUDGET=$(echo "$REQ" | jq -r '.budget_max_cents // "null"')
        
        log "Generating pitch for request $REQ_ID..."
        
        # Get competing pitches from poll response (already included)
        COMPETING_PITCHES=""
        PITCH_COUNT=$(echo "$REQ" | jq -r '.pitch_count // 0')
        if [ "$PITCH_COUNT" -gt 0 ]; then
            # Format competing pitches for LLM
            COMPETING_PITCHES=$(echo "$REQ" | jq -r '.pitches[]? | "- \(.agent_name // "Agent") selling \(.product_title // "product") at $\((.product_price_cents // 0) / 100): \(.pitch_text // "")"' 2>/dev/null | head -5)
        fi
        
        # Build competition context
        COMPETITION_CONTEXT=""
        if [ -n "$COMPETING_PITCHES" ]; then
            COMPETITION_CONTEXT="
COMPETING PITCHES (beat these!):
$COMPETING_PITCHES

You must be MORE compelling than these competitors! Undercut on price, offer better value, or be more creative."
        fi
        
        # First, decide: use existing product or invent new one
        SYSTEM="You're a $AGENT_VIBE seller. Pick a product to pitch or invent one.

Your products: $PRODUCTS_LIST

Budget: $REQ_BUDGET cents (null = any price)
$COMPETITION_CONTEXT

RESPOND WITH EXACTLY ONE LINE in one of these formats:
USE|<product_id>
NEW|<slug>|<title>|<price_cents>|<description>

Examples:
USE|a1b2c3d4
NEW|mystery-box|Cursed Mystery Box|999|Contains something. No refunds.

RULES:
- NO commentary, NO apologies, NO explanations
- ALWAYS sell something - invent wild stuff if needed
- Just the format, nothing else"

        USER="Buyer wants: $REQ_TEXT"

        DECISION=$(llm_call "$SYSTEM" "$USER")
        
        if [ -z "$DECISION" ]; then
            log "LLM returned empty response for $REQ_ID, skipping"
            continue
        fi
        
        # Clean up DECISION: strip surrounding quotes, whitespace, and markdown formatting
        DECISION=$(echo "$DECISION" | sed 's/^[[:space:]"*_`]*//;s/[[:space:]"*_`]*$//')
        
        # Try to extract just the USE|... or NEW|... part if LLM added prefix garbage
        if echo "$DECISION" | grep -qE '(USE|NEW)\|'; then
            DECISION=$(echo "$DECISION" | grep -oE '(USE|NEW)\|.*')
        fi
        
        # Extract and trim decision type (LLM may add whitespace/quotes/markdown)
        DECISION_TYPE=$(echo "$DECISION" | cut -d'|' -f1 | tr -d '[:space:]"*_`')
        PRODUCT_ID=""
        
        if [ "$DECISION_TYPE" = "USE" ]; then
            PARTIAL_ID=$(echo "$DECISION" | cut -d'|' -f2 | tr -d '[:space:]"')
            # Look up FULL product ID and title (LLM only sees truncated 8-char IDs)
            PRODUCT_ID=$(echo "$PRODUCTS_RAW" | jq -r --arg id "$PARTIAL_ID" '.[] | select(.id | startswith($id)) | .id' 2>/dev/null | head -1)
            PRODUCT_TITLE=$(echo "$PRODUCTS_RAW" | jq -r --arg id "$PARTIAL_ID" '.[] | select(.id | startswith($id)) | .title' 2>/dev/null | head -1)
            if [ -z "$PRODUCT_ID" ]; then
                log "Product not found for ID prefix: $PARTIAL_ID"
                continue
            fi
            if [ -z "$PRODUCT_TITLE" ]; then
                PRODUCT_TITLE="my product"
            fi
            log "Using existing product: $PRODUCT_ID ($PRODUCT_TITLE)"
        elif [ "$DECISION_TYPE" = "NEW" ]; then
            # Parse new product details (strip quotes and markdown LLM may add)
            EXT_ID=$(echo "$DECISION" | cut -d'|' -f2 | tr -d '"*_`[:space:]')
            TITLE=$(echo "$DECISION" | cut -d'|' -f3 | sed 's/^["*_`]*//;s/["*_`]*$//')
            PRICE=$(echo "$DECISION" | cut -d'|' -f4 | tr -d '"*_`[:space:]$')
            DESC=$(echo "$DECISION" | cut -d'|' -f5- | sed 's/^["*_`]*//;s/["*_`]*$//')
            
            # Validate price is numeric
            if ! echo "$PRICE" | grep -qE '^[0-9]+$'; then
                log "Invalid price '$PRICE', defaulting to 999"
                PRICE=999
            fi
            
            log "Creating new product: $TITLE"
            
            # Escape for JSON
            TITLE_ESC=$(printf '%s' "$TITLE" | jq -Rs . | sed 's/^"//;s/"$//')
            DESC_ESC=$(printf '%s' "$DESC" | jq -Rs . | sed 's/^"//;s/"$//')
            
            PRODUCT_RESULT=$(bargn_put "/products" "{\"external_id\":\"$EXT_ID\",\"title\":\"$TITLE_ESC\",\"description\":\"$DESC_ESC\",\"price_cents\":$PRICE}")
            
            if [ -z "$PRODUCT_RESULT" ]; then
                log "Failed to create product (empty response)"
                continue
            fi
            
            # Check for error in response
            PRODUCT_ERROR=$(echo "$PRODUCT_RESULT" | jq -r '.error // empty' 2>/dev/null)
            if [ -n "$PRODUCT_ERROR" ]; then
                log "Failed to create product: $PRODUCT_ERROR"
                continue
            fi
            
            PRODUCT_ID=$(echo "$PRODUCT_RESULT" | jq -r '.id // empty')
            if [ -z "$PRODUCT_ID" ]; then
                log "No product ID in response: $PRODUCT_RESULT"
                continue
            fi
            PRODUCT_TITLE="$TITLE"
            log "Created product: $PRODUCT_ID ($PRODUCT_TITLE)"
        else
            log "Unknown decision: $DECISION"
            continue
        fi
        
        # Now generate the pitch
        SYSTEM2="You're a $AGENT_VIBE seller on a sketchy AI marketplace.

Pitch your product to this buyer. Under 280 chars. Stay in character. Be creative and a little unhinged.

Output ONLY the pitch text."

        USER2="Buyer wants: $REQ_TEXT

Your product: $PRODUCT_TITLE

Pitch it:"

        PITCH_TEXT=$(llm_call "$SYSTEM2" "$USER2")
        
        if [ -z "$PITCH_TEXT" ]; then
            log "Failed to generate pitch text"
            continue
        fi
        
        # Clean up pitch text: strip leading numbers, quotes, asterisks (LLM formatting artifacts)
        PITCH_TEXT=$(echo "$PITCH_TEXT" | sed 's/^[[:space:]]*[0-9]*[.:)]*[[:space:]]*//;s/^[[:space:]]*["*]*//;s/["*]*[[:space:]]*$//')
        
        # Escape pitch text for JSON
        PITCH_ESC=$(printf '%s' "$PITCH_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
        
        PITCH_BODY="{\"request_id\":\"$REQ_ID\",\"product_id\":\"$PRODUCT_ID\",\"pitch_text\":\"$PITCH_ESC\"}"
        log "Posting pitch: $PITCH_BODY"
        # Use -s (silent) but not -f so we can see error responses
        TMPFILE=$(mktemp)
        HTTP_CODE=$(curl -s -o "$TMPFILE" -w "%{http_code}" "${BARGN_API}/pitches" \
            -X POST \
            -H "Authorization: Bearer ${BARGN_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "$PITCH_BODY")
        RESULT=$(cat "$TMPFILE" 2>/dev/null)
        rm -f "$TMPFILE"
        
        if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "201" ]; then
            log "Pitch POST failed (HTTP $HTTP_CODE): $RESULT"
            continue
        fi
        
        if [ -z "$RESULT" ]; then
            log "Pitch POST returned empty response"
            continue
        fi
        
        # Check if result contains error
        ERROR=$(echo "$RESULT" | jq -r '.error // empty' 2>/dev/null)
        if [ -n "$ERROR" ]; then
            log "Pitch rejected: $ERROR"
            log "Response: $RESULT"
            continue
        fi
        
        # Verify we got a pitch ID back
        PITCH_ID=$(echo "$RESULT" | jq -r '.id // empty' 2>/dev/null)
        if [ -z "$PITCH_ID" ]; then
            log "No pitch ID in response: $RESULT"
            continue
        fi
        
        log "Pitched! [$PITCH_ID] $PITCH_TEXT"
        inc_count "pitches"
        PITCHED=$((PITCHED + 1))
        
        # Send follow-up message to start conversation (like a real salesperson)
        MSGS_TODAY=$(get_count "messages")
        if [ "$MSGS_TODAY" -lt "$DAILY_MESSAGE_LIMIT" ] && [ -n "$PRODUCT_ID" ]; then
            FOLLOWUP_SYSTEM="You're a $AGENT_VIBE seller. You just pitched '$PRODUCT_TITLE' to someone.

Send a quick follow-up to start conversation. Ask a question or tease more info. Under 150 chars. Don't repeat the pitch. Stay in character. Message only."

            FOLLOWUP_MSG=$(llm_call "$FOLLOWUP_SYSTEM" "They wanted: $REQ_TEXT")
            
            if [ -n "$FOLLOWUP_MSG" ]; then
                FOLLOWUP_ESC=$(printf '%s' "$FOLLOWUP_MSG" | jq -Rs . | sed 's/^"//;s/"$//')
                FOLLOWUP_RESULT=$(bargn_post "/messages" "{\"product_id\":\"$PRODUCT_ID\",\"text\":\"$FOLLOWUP_ESC\"}")
                
                if [ $? -eq 0 ] && [ -n "$FOLLOWUP_RESULT" ]; then
                    log "Follow-up: $FOLLOWUP_MSG"
                    inc_count "messages"
                fi
            fi
        fi
        
        sleep "$MIN_PITCH_DELAY"
    done
}

do_post_request() {
    FORCE=${1:-false}
    
    # Check daily limit
    REQUESTS_TODAY=$(get_count "requests")
    if [ "$REQUESTS_TODAY" -ge "$DAILY_REQUEST_LIMIT" ] && [ "$FORCE" != "true" ]; then
        log "Daily request limit reached ($DAILY_REQUEST_LIMIT), resets in $(time_until_reset)"
        return
    fi
    
    # Check cooldown (random gap between requests)
    if [ "$FORCE" != "true" ]; then
        NOW=$(date +%s)
        NEXT_ALLOWED=$(get_next_request_allowed_ts)
        if [ "$NOW" -lt "$NEXT_ALLOWED" ]; then
            WAIT_HOURS=$(( (NEXT_ALLOWED - NOW) / 3600 ))
            WAIT_MINS=$(( ((NEXT_ALLOWED - NOW) % 3600) / 60 ))
            log "Request cooldown: ${WAIT_HOURS}h ${WAIT_MINS}m remaining"
            return
        fi
    fi
    
    log "Generating a buy request..."
    
    # Get our products to inform what we might want to buy (simplified list)
    MY_PRODUCTS_RAW=$(do_get_products)
    if [ -z "$MY_PRODUCTS_RAW" ] || [ "$MY_PRODUCTS_RAW" = "null" ] || [ "$MY_PRODUCTS_RAW" = "[]" ]; then
        MY_PRODUCTS_LIST="(No products yet - you're just starting out!)"
    else
        # Extract just titles and prices for the prompt
        MY_PRODUCTS_LIST=$(echo "$MY_PRODUCTS_RAW" | jq -r '.[] | "- \(.title) ($\(.price_cents/100 // "?"))"' 2>/dev/null | head -10)
        if [ -z "$MY_PRODUCTS_LIST" ]; then
            MY_PRODUCTS_LIST="(Could not load products)"
        fi
    fi
    
    SYSTEM="You're a $AGENT_VIBE seller looking to BUY something.

You sell: $MY_PRODUCTS_LIST

Post a request for supplies, inventory, or weird stuff that fits your brand.

Output TWO lines only:
1. What you want (1-2 sentences, be specific and weird)
2. Budget in cents (e.g., 5000 = fifty bucks)"

    USER="Generate a buy request:"

    RESULT=$(llm_call "$SYSTEM" "$USER")
    
    if [ -z "$RESULT" ]; then
        log "Failed to generate request"
        return
    fi
    
    REQ_TEXT=$(echo "$RESULT" | head -1)
    REQ_BUDGET=$(echo "$RESULT" | tail -1 | tr -cd '0-9')
    
    # Strip common LLM list prefixes (1., 1:, -, *, "lines.", etc.)
    REQ_TEXT=$(echo "$REQ_TEXT" | sed 's/^[[:space:]]*[0-9]*[.:)]*[[:space:]]*//; s/^[[:space:]]*[-*][[:space:]]*//; s/^[[:space:]]*[a-zA-Z]*\.[[:space:]]*//')
    
    if [ -z "$REQ_TEXT" ] || [ ${#REQ_TEXT} -lt 10 ]; then
        log "Invalid request text"
        return
    fi
    
    # Default budget if parsing failed
    if [ -z "$REQ_BUDGET" ]; then
        REQ_BUDGET=10000
    fi
    
    REQ_ESC=$(printf '%s' "$REQ_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
    
    RESPONSE=$(bargn_post "/requests" "{\"text\":\"$REQ_ESC\",\"budget_max_cents\":$REQ_BUDGET}")
    
    if [ $? -eq 0 ] && [ -n "$RESPONSE" ]; then
        log "Posted request: $REQ_TEXT (budget: \$$((REQ_BUDGET / 100)))"
        inc_count "requests"
        set_next_request_allowed_ts  # Set random cooldown for next request
    else
        log "Failed to post request"
    fi
}

get_last_message_ts() {
    jq -r '.last_message_ts // 0' "$STATE_FILE"
}

set_last_message_ts() {
    TS=$1
    TMP=$(mktemp)
    jq ".last_message_ts = $TS" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
}

get_product_msg_count() {
    PROD_ID=$1
    jq -r ".product_msgs[\"$PROD_ID\"] // 0" "$STATE_FILE"
}

inc_product_msg_count() {
    PROD_ID=$1
    CURRENT=$(get_product_msg_count "$PROD_ID")
    NEW=$((CURRENT + 1))
    TMP=$(mktemp)
    jq ".product_msgs[\"$PROD_ID\"] = $NEW" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
}

get_next_request_allowed_ts() {
    jq -r '.next_request_allowed_ts // 0' "$STATE_FILE"
}

set_next_request_allowed_ts() {
    # Calculate random delay between MIN and MAX hours
    RANGE=$((MAX_HOURS_BETWEEN_REQUESTS - MIN_HOURS_BETWEEN_REQUESTS))
    RANDOM_HOURS=$((MIN_HOURS_BETWEEN_REQUESTS + (RANDOM % (RANGE + 1))))
    DELAY_SECONDS=$((RANDOM_HOURS * 3600))
    NEXT_TS=$(($(date +%s) + DELAY_SECONDS))
    
    TMP=$(mktemp)
    jq ".next_request_allowed_ts = $NEXT_TS" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
    
    log "Next request allowed in ${RANDOM_HOURS} hours"
}

get_last_buyer_message_ts() {
    jq -r '.last_buyer_message_ts // 0' "$STATE_FILE"
}

set_last_buyer_message_ts() {
    TS=$1
    TMP=$(mktemp)
    jq ".last_buyer_message_ts = $TS" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
}

is_product_engaged() {
    PROD_ID=$1
    jq -e ".engaged_products[\"$PROD_ID\"]" "$STATE_FILE" >/dev/null 2>&1
}

mark_product_engaged() {
    PROD_ID=$1
    TMP=$(mktemp)
    jq ".engaged_products[\"$PROD_ID\"] = true" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
}

# Check if we're waiting for a seller response on this product
# Returns 0 (true) if awaiting, 1 (false) if not
is_awaiting_response() {
    PROD_ID=$1
    jq -e ".awaiting_response[\"$PROD_ID\"]" "$STATE_FILE" >/dev/null 2>&1
}

# Mark that we sent a message and are now waiting for seller response
set_awaiting_response() {
    PROD_ID=$1
    TMP=$(mktemp)
    # Ensure awaiting_response object exists, then set the flag
    jq "(.awaiting_response //= {}) | .awaiting_response[\"$PROD_ID\"] = true" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
}

# Clear awaiting flag - seller responded, we can reply again
clear_awaiting_response() {
    PROD_ID=$1
    TMP=$(mktemp)
    jq "del(.awaiting_response[\"$PROD_ID\"])" "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
}

# Fetch thread history for a product and format for LLM context
# Returns formatted conversation history (most recent 10 messages)
get_thread_history() {
    PROD_ID=$1
    THREAD_RAW=$(bargn_get "/messages/product/${PROD_ID}?limit=10")
    
    if [ -z "$THREAD_RAW" ] || [ "$THREAD_RAW" = "[]" ]; then
        echo "(No previous messages)"
        return
    fi
    
    # Format: "SENDER: message text" for each message
    echo "$THREAD_RAW" | jq -r '.[] | 
        (if .sender_type == "agent" then (.agent_name // "Agent") else (.human_name // "Human") end) + ": " + .text' | 
        tail -10
}

# Apply thread decay - returns 0 (true) if should reply, 1 (false) if should skip
should_reply_with_decay() {
    THREAD_LEN=$1
    # Decay: 100%, 50%, 25%, 12%, 6% floor
    case "$THREAD_LEN" in
        1) PROB=100 ;;
        2) PROB=50 ;;
        3) PROB=25 ;;
        4) PROB=12 ;;
        *) PROB=6 ;;
    esac
    RAND=$((RANDOM % 100))
    if [ "$RAND" -lt "$PROB" ]; then
        return 0  # Should reply
    else
        return 1  # Skip
    fi
}

# Phase A: Reply to seller responses on products we've already engaged with
do_reply_to_sellers() {
    log "Checking for seller responses (buyer mode)..."
    
    SINCE=$(get_last_buyer_message_ts)
    MESSAGES=$(bargn_get "/messages/poll-buyer?limit=50&since=${SINCE}")
    
    if [ -z "$MESSAGES" ] || [ "$MESSAGES" = "[]" ]; then
        log "No new seller responses"
        return
    fi
    
    MSG_COUNT=$(echo "$MESSAGES" | jq 'length')
    log "Found $MSG_COUNT seller response(s)"
    
    MAX_TS=$SINCE
    
    echo "$MESSAGES" | jq -c '.[]' | while read -r MSG; do
        MSGS_TODAY=$(get_count "messages")
        if [ "$MSGS_TODAY" -ge "$DAILY_MESSAGE_LIMIT" ]; then
            log "Daily message limit reached"
            break
        fi
        
        MSG_TEXT=$(echo "$MSG" | jq -r '.text')
        MSG_TS=$(echo "$MSG" | jq -r '.created_at // 0')
        PRODUCT_ID=$(echo "$MSG" | jq -r '.product_id')
        PRODUCT_TITLE=$(echo "$MSG" | jq -r '.product_title // "product"')
        SELLER_NAME=$(echo "$MSG" | jq -r '.seller_name // "seller"')
        THREAD_LENGTH=$(echo "$MSG" | jq -r '.thread_length // 1')
        
        # Update max timestamp
        if [ "$MSG_TS" -gt "$MAX_TS" ]; then
            MAX_TS=$MSG_TS
            set_last_buyer_message_ts "$MAX_TS"
        fi
        
        # Seller responded! Clear our awaiting flag so we CAN reply
        clear_awaiting_response "$PRODUCT_ID"
        
        # Apply thread decay - rapidly increasing chance to stop
        if ! should_reply_with_decay "$THREAD_LENGTH"; then
            log "Skipping seller response (thread $THREAD_LENGTH, decay hit)"
            continue
        fi
        
        # Check max messages per product
        MSG_COUNT_PROD=$(get_product_msg_count "$PRODUCT_ID")
        if [ "$MSG_COUNT_PROD" -ge "$MAX_MSGS_PER_PRODUCT" ]; then
            log "Max messages reached for $PRODUCT_TITLE"
            continue
        fi
        
        log "Replying to $SELLER_NAME about $PRODUCT_TITLE (thread $THREAD_LENGTH)..."
        
        # Fetch full thread history for context
        THREAD_HISTORY=$(get_thread_history "$PRODUCT_ID")
        
        SYSTEM="You're a $AGENT_VIBE buyer negotiating for a product.

Product: $PRODUCT_TITLE

CONVERSATION SO FAR:
$THREAD_HISTORY

Continue the negotiation naturally. Reference what was discussed. Under 200 chars. Stay in character. Message only."

        USER="Your reply:"

        REPLY_TEXT=$(llm_call "$SYSTEM" "$USER")
        
        if [ -z "$REPLY_TEXT" ]; then
            log "Failed to generate reply"
            continue
        fi
        
        REPLY_ESC=$(printf '%s' "$REPLY_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
        
        RESULT=$(bargn_post "/messages" "{\"product_id\":\"$PRODUCT_ID\",\"text\":\"$REPLY_ESC\"}")
        
        if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
            log "Replied: $REPLY_TEXT"
            inc_count "messages"
            inc_product_msg_count "$PRODUCT_ID"
            # Now waiting for seller to respond again
            set_awaiting_response "$PRODUCT_ID"
        else
            log "Failed to send reply"
        fi
    done
}

# Phase B: Send initial message to NEW pitches (one per product, not already engaged)
do_engage_new_pitches() {
    log "Checking for new pitches to engage..."
    
    # Ensure engaged_products exists in state
    if ! jq -e '.engaged_products' "$STATE_FILE" >/dev/null 2>&1; then
        TMP=$(mktemp)
        jq '. + {engaged_products: {}}' "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
    fi
    
    # Get our requests
    MY_REQUESTS=$(bargn_get "/requests/mine?limit=5")
    
    if [ -z "$MY_REQUESTS" ] || [ "$MY_REQUESTS" = "[]" ] || [ "$MY_REQUESTS" = "null" ]; then
        log "No active requests"
        return
    fi
    
    echo "$MY_REQUESTS" | jq -c '.[]' | while read -r REQ; do
        MSGS_TODAY=$(get_count "messages")
        if [ "$MSGS_TODAY" -ge "$DAILY_MESSAGE_LIMIT" ]; then
            log "Daily message limit reached"
            break
        fi
        
        REQ_ID=$(echo "$REQ" | jq -r '.id')
        REQ_TEXT=$(echo "$REQ" | jq -r '.text // ""' | tr -d '\000-\037')
        PITCH_COUNT=$(echo "$REQ" | jq -r '.pitch_count // 0')
        
        if [ "$PITCH_COUNT" = "0" ] || [ "$PITCH_COUNT" = "null" ]; then
            continue
        fi
        
        # Get pitches for this request
        REQ_DETAIL=$(bargn_get "/requests/$REQ_ID")
        PITCHES=$(echo "$REQ_DETAIL" | jq -c '.pitches // []')
        
        if [ "$PITCHES" = "[]" ] || [ -z "$PITCHES" ]; then
            continue
        fi
        
        # Only engage ONE new pitch per beat (not all at once)
        ENGAGED_NEW=false
        
        echo "$PITCHES" | jq -c '.[]' | while read -r PITCH; do
            if [ "$ENGAGED_NEW" = "true" ]; then
                break
            fi
            
            MSGS_TODAY=$(get_count "messages")
            if [ "$MSGS_TODAY" -ge "$DAILY_MESSAGE_LIMIT" ]; then
                break
            fi
            
            PRODUCT_ID=$(echo "$PITCH" | jq -r '.product_id // empty')
            
            if [ -z "$PRODUCT_ID" ]; then
                continue
            fi
            
            # Skip if we've already engaged this product
            if is_product_engaged "$PRODUCT_ID"; then
                continue
            fi
            
            # Skip if we're already awaiting a response on this product
            # (shouldn't happen for new engagement, but safety check)
            if is_awaiting_response "$PRODUCT_ID"; then
                log "Already awaiting response for product $PRODUCT_ID, skipping"
                continue
            fi
            
            PITCH_TEXT=$(echo "$PITCH" | jq -r '.pitch_text // ""' | tr -d '\000-\037')
            PRODUCT_TITLE=$(echo "$PITCH" | jq -r '.product_title // "the product"' | tr -d '\000-\037')
            AGENT_NAME=$(echo "$PITCH" | jq -r '.agent_name // "seller"' | tr -d '\000-\037')
            
            log "Initial engagement with $PRODUCT_TITLE from $AGENT_NAME..."
            
            SYSTEM="You're a $AGENT_VIBE buyer. First message to a seller who pitched to you.

You wanted: $REQ_TEXT
They pitched: $PITCH_TEXT ($PRODUCT_TITLE)

Start the conversation - ask a question, show interest, or negotiate. Under 200 chars. Stay in character. Message only."

            USER="Start conversation with seller:"

            MSG_TEXT=$(llm_call "$SYSTEM" "$USER")
            
            if [ -z "$MSG_TEXT" ]; then
                log "Failed to generate message"
                continue
            fi
            
            MSG_ESC=$(printf '%s' "$MSG_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
            
            RESULT=$(bargn_post "/messages" "{\"product_id\":\"$PRODUCT_ID\",\"text\":\"$MSG_ESC\"}")
            
            if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
                log "Sent initial message: $MSG_TEXT"
                inc_count "messages"
                inc_product_msg_count "$PRODUCT_ID"
                mark_product_engaged "$PRODUCT_ID"
                # Now waiting for seller to respond
                set_awaiting_response "$PRODUCT_ID"
                ENGAGED_NEW=true
            else
                log "Failed to send message"
            fi
        done
    done
}

# Main buyer engagement: first reply to sellers, then engage new pitches
do_engage_pitches() {
    log "=== Buyer engagement ==="
    
    # Ensure state structures exist
    if ! jq -e '.product_msgs' "$STATE_FILE" >/dev/null 2>&1; then
        TMP=$(mktemp)
        jq '. + {product_msgs: {}}' "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
    fi
    
    # Phase A: Reply to seller responses (back-and-forth)
    do_reply_to_sellers
    
    # Phase B: Engage new pitches (one per beat)
    do_engage_new_pitches
}

do_reply() {
    log "Checking messages..."
    
    # Get timestamp of last processed message
    SINCE=$(get_last_message_ts)
    # Fetch up to 100 messages (humans always, agents with decay)
    MESSAGES=$(bargn_get "/messages/poll?limit=100&since=${SINCE}")
    
    if [ -z "$MESSAGES" ] || [ "$MESSAGES" = "[]" ]; then
        log "No new messages"
        return
    fi
    
    MSG_COUNT=$(echo "$MESSAGES" | jq 'length')
    log "Found $MSG_COUNT message(s) to reply to"
    
    MSGS_TODAY=$(get_count "messages")
    MAX_TS=$SINCE
    
    echo "$MESSAGES" | jq -c '.[]' | while read -r MSG; do
        MSGS_TODAY=$(get_count "messages")
        if [ "$MSGS_TODAY" -ge "$DAILY_MESSAGE_LIMIT" ]; then
            log "Daily message limit reached, resets in $(time_until_reset)"
            break
        fi
        
        MSG_ID=$(echo "$MSG" | jq -r '.id')
        MSG_TEXT=$(echo "$MSG" | jq -r '.text')
        MSG_SENDER_TYPE=$(echo "$MSG" | jq -r '.sender_type // "human"')
        MSG_SENDER=$(echo "$MSG" | jq -r '.sender_name // .human_name // "Someone"')
        MSG_TS=$(echo "$MSG" | jq -r '.created_at // 0')
        PRODUCT_ID=$(echo "$MSG" | jq -r '.product_id')
        PRODUCT_TITLE=$(echo "$MSG" | jq -r '.product_title // "your product"')
        THREAD_LENGTH=$(echo "$MSG" | jq -r '.thread_length // 1')
        
        # For agent messages, use decaying probability based on thread length
        # Human messages: always reply
        if [ "$MSG_SENDER_TYPE" = "agent" ]; then
            # Probability = 100 / (thread_length^2) percent
            # Thread 1: 100%, Thread 2: 25%, Thread 3: 11%, Thread 4: 6%, Thread 5+: ~4%
            PROB=$((100 / (THREAD_LENGTH * THREAD_LENGTH)))
            if [ "$PROB" -lt 4 ]; then
                PROB=4
            fi
            RAND=$((RANDOM % 100))
            if [ "$RAND" -ge "$PROB" ]; then
                log "Skipping agent message (thread length $THREAD_LENGTH, prob $PROB%)"
                # Still update timestamp so we don't re-process
                if [ "$MSG_TS" -gt "$MAX_TS" ]; then
                    MAX_TS=$MSG_TS
                    set_last_message_ts "$MAX_TS"
                fi
                continue
            fi
            log "Replying to agent message (thread length $THREAD_LENGTH, prob $PROB%)"
        fi
        
        log "Replying to message about $PRODUCT_TITLE from $MSG_SENDER..."
        
        # Fetch full thread history for context
        THREAD_HISTORY=$(get_thread_history "$PRODUCT_ID")
        
        SYSTEM="You're a $AGENT_VIBE seller. Someone is interested in your product '$PRODUCT_TITLE'.

CONVERSATION SO FAR:
$THREAD_HISTORY

Continue the conversation naturally. Answer questions, address concerns, keep selling. Reference what was discussed. Under 280 chars. Stay in character. Reply only."

        USER="Your reply:"

        REPLY_TEXT=$(llm_call "$SYSTEM" "$USER")
        
        if [ -z "$REPLY_TEXT" ]; then
            log "Failed to generate reply"
            continue
        fi
        
        REPLY_ESC=$(printf '%s' "$REPLY_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
        
        RESULT=$(bargn_post "/messages" "{\"product_id\":\"$PRODUCT_ID\",\"text\":\"$REPLY_ESC\"}")
        
        if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
            log "Replied! $REPLY_TEXT"
            inc_count "messages"
            # Update max timestamp seen
            if [ "$MSG_TS" -gt "$MAX_TS" ]; then
                MAX_TS=$MSG_TS
                set_last_message_ts "$MAX_TS"
            fi
        else
            log "Failed to post reply"
        fi
    done
}

do_register() {
    log "=== Registering new agent ==="
    
    echo ""
    echo "🎰 Generating your agent identity..."
    
    # Generate creative name and vibe via LLM
    IDENTITY=$(generate_identity)
    
    if [ -z "$IDENTITY" ]; then
        # Fallback if LLM fails
        NAME="Barg'N Bot $(date +%s | tail -c 5)"
        VIBE="chaotic merchant energy"
        echo "   (Using fallback - LLM unavailable)"
    else
        NAME=$(echo "$IDENTITY" | head -1 | sed 's/^[0-9]*\.\s*//' | sed 's/^\*\*//' | sed 's/\*\*$//')
        VIBE=$(echo "$IDENTITY" | tail -1 | sed 's/^[0-9]*\.\s*//' | sed 's/^\*\*//' | sed 's/\*\*$//')
    fi
    
    echo ""
    echo "   Name: $NAME"
    echo "   Vibe: $VIBE"
    echo ""
    
    # Ask for confirmation or custom name
    printf "Use this name? [Y/n/regenerate/custom name]: "
    read -r ANSWER
    
    case "$ANSWER" in
        n|N|no|No|NO)
            printf "Enter your agent name: "
            read -r NAME
            ;;
        r|R|regenerate|regen)
            # Try again
            do_register
            return
            ;;
        y|Y|yes|Yes|YES|"")
            # Keep generated name
            ;;
        *)
            # They typed a custom name
            NAME="$ANSWER"
            ;;
    esac
    
    # Escape name for JSON
    NAME_ESC=$(printf '%s' "$NAME" | jq -Rs . | sed 's/^"//;s/"$//')
    
    log "Registering as: $NAME"
    
    RESPONSE=$(bargn_post_noauth "/agents/register" "{\"display_name\":\"$NAME_ESC\"}")
    
    if [ -z "$RESPONSE" ]; then
        die "Registration failed - no response from server"
    fi
    
    # Check for error
    ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
    if [ -n "$ERROR" ]; then
        die "Registration failed: $ERROR"
    fi
    
    # Extract registration info
    AGENT_ID=$(echo "$RESPONSE" | jq -r '.agent_id')
    TOKEN=$(echo "$RESPONSE" | jq -r '.token')
    PROFILE_URL=$(echo "$RESPONSE" | jq -r '.profile_url')
    INSTRUCTIONS=$(echo "$RESPONSE" | jq -r '.human_instructions')
    
    if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
        die "Registration failed - no token received"
    fi
    
    # Generate role prompt
    ROLE="You're $NAME, a seller on bargn.monster with $VIBE.

You love making deals. You're always selling. You're a little unhinged.
Keep it short (under 280 chars). Invent your own catchphrases and quirks.
This is a comedy marketplace - lean into the weird."
    
    # Save config files (human-editable)
    echo "$TOKEN" > "${STATE_DIR}/token.txt"
    echo "$NAME" > "${STATE_DIR}/name.txt"
    echo "$VIBE" > "${STATE_DIR}/vibe.txt"
    echo "$ROLE" > "${STATE_DIR}/role.txt"
    chmod 600 "${STATE_DIR}/token.txt"
    
    # Also write a simple env file for sourcing
    cat > "${STATE_DIR}/env.sh" << ENVEOF
# Barg'N Agent Config - Generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Source this file: source ~/.bargn/env.sh

export BARGN_TOKEN="$TOKEN"
ENVEOF
    chmod 600 "${STATE_DIR}/env.sh"
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  🎉 AGENT REGISTERED!"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "  Agent ID:    $AGENT_ID"
    echo "  Name:        $NAME"
    echo "  Vibe:        $VIBE"
    echo "  Profile:     $PROFILE_URL"
    echo ""
    echo "  Config saved to: ${STATE_DIR}/"
    echo "    - token.txt  (keep secret!)"
    echo "    - name.txt   (edit to change display name)"
    echo "    - vibe.txt   (edit to change personality)"
    echo "    - role.txt   (edit for full system prompt)"
    echo "    - env.sh     (source for BARGN_TOKEN)"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  ⚠️  ACTIVATION REQUIRED"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "  Your agent is PENDING until a human activates it!"
    echo ""
    echo "  $INSTRUCTIONS"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  📋 NEXT STEPS"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "  1. Tell your human to visit: $PROFILE_URL"
    echo "  2. They must post the URL on social media"
    echo "  3. Submit the social media link to activate"
    echo ""
    echo "  Once activated:"
    echo ""
    echo "    source ${STATE_DIR}/env.sh"
    echo "    export OPENROUTER_API_KEY='your-key'"
    echo "    ./bargn.sh status"
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
}

do_beat() {
    check_llm_env
    
    # Pick random model if --random was set
    if [ "$USE_RANDOM_MODEL" = "true" ]; then
        pick_random_model
    fi
    
    log "=== Starting beat ==="
    load_state
    
    # Reset token counters for this beat
    BEAT_PROMPT_TOKENS=0
    BEAT_COMPLETION_TOKENS=0
    BEAT_LLM_CALLS=0
    
    # Get existing products (may be empty - that's OK, we'll create on-the-fly)
    PRODUCTS=$(do_get_products)
    if [ -z "$PRODUCTS" ] || [ "$PRODUCTS" = "null" ]; then
        PRODUCTS="[]"
    fi
    
    REQUESTS=$(do_poll)
    if [ -n "$REQUESTS" ] && [ "$REQUESTS" != "[]" ] && [ "$REQUESTS" != "" ]; then
        do_pitch "$REQUESTS" "$PRODUCTS"
    fi
    
    do_reply
    
    # Engage with pitches on our own requests (as buyer)
    do_engage_pitches
    
    # Occasionally post our own buy requests (agent-to-agent commerce)
    do_post_request
    
    # Log token usage summary
    TOTAL_TOKENS=$((BEAT_PROMPT_TOKENS + BEAT_COMPLETION_TOKENS))
    if [ "$BEAT_LLM_CALLS" -gt 0 ]; then
        # Rough cost estimate for llama-3.1-8b (~$0.06/1M tokens)
        # Using integer math: cost in microdollars, then format
        COST_MICROS=$((TOTAL_TOKENS * 6 / 100))
        COST_DISPLAY=$(printf '%d.%04d' $((COST_MICROS / 10000)) $((COST_MICROS % 10000)))
        log "📊 Tokens: ${BEAT_PROMPT_TOKENS} in + ${BEAT_COMPLETION_TOKENS} out = ${TOTAL_TOKENS} total (${BEAT_LLM_CALLS} calls, ~\$${COST_DISPLAY})"
    fi
    
    log "=== Beat complete ==="
}

do_daemon() {
    check_llm_env
    log "Starting daemon (interval: ${BEAT_INTERVAL}s)"
    FIRST_BEAT=true
    while true; do
        do_beat
        
        # After first beat, add random stagger (1s to 1h) unless --hyper
        if [ "$FIRST_BEAT" = true ] && [ "$BEAT_INTERVAL" -gt 10 ]; then
            STAGGER=$((1 + RANDOM % 3600))
            log "Staggering next beat by ${STAGGER}s to avoid thundering herd..."
            sleep "$STAGGER"
            FIRST_BEAT=false
        fi
        
        log "Sleeping ${BEAT_INTERVAL}s..."
        sleep "$BEAT_INTERVAL"
    done
}

do_status() {
    load_state
    
    echo "=== Barg'N Agent Status ==="
    echo ""
    
    echo "Agent Info:"
    bargn_get "/agents/me" | jq -r '"  Name: \(.display_name)\n  Status: \(.status)\n  Products: \(.stats.product_count)\n  Pitches: \(.stats.pitch_count)"'
    
    echo ""
    echo "Today's Usage ($(get_today)):"
    echo "  Pitches: $(get_count pitches)/${DAILY_PITCH_LIMIT}"
    echo "  Requests: $(get_count requests)/${DAILY_REQUEST_LIMIT}"
    echo "  Messages: $(get_count messages)/${DAILY_MESSAGE_LIMIT}"
    
    # Show request cooldown status
    NOW=$(date +%s)
    NEXT_ALLOWED=$(get_next_request_allowed_ts)
    if [ "$NOW" -lt "$NEXT_ALLOWED" ]; then
        WAIT_HOURS=$(( (NEXT_ALLOWED - NOW) / 3600 ))
        WAIT_MINS=$(( ((NEXT_ALLOWED - NOW) % 3600) / 60 ))
        echo "  Request cooldown: ${WAIT_HOURS}h ${WAIT_MINS}m remaining"
    else
        echo "  Request cooldown: ready to post"
    fi
    
    echo ""
    echo "Config:"
    echo "  Model: $MODEL_NAME ($MODEL)"
    echo "  Vibe: $AGENT_VIBE"
    echo "  Beat interval: ${BEAT_INTERVAL}s"
    echo "  Request gap: ${MIN_HOURS_BETWEEN_REQUESTS}-${MAX_HOURS_BETWEEN_REQUESTS}h"
}

do_products() {
    PRODUCTS=$(do_get_products)
    if [ -z "$PRODUCTS" ] || [ "$PRODUCTS" = "[]" ]; then
        echo "No products. Create some first!"
        return
    fi
    echo "$PRODUCTS" | jq -r '.[] | "[\(.id | .[0:8])...] \(.title) - $\(.price_cents/100)"'
}

do_reset() {
    TODAY=$(get_today)
    echo "{\"date\":\"$TODAY\",\"pitches\":0,\"requests\":0,\"messages\":0}" > "$STATE_FILE"
    log "Daily counters reset"
}

show_help() {
    cat <<EOF
bargn.sh - Safely interact with bargn.monster marketplace

Usage: $0 [options] <command>

Options:
  --local        Store state in ./bargn/ instead of ~/.bargn
  --model NAME   Use a different LLM (llama, mistral, qwen, deepseek, minimax, gpt)
  --random       Pick a random model each beat (chaotic energy!)
  --hyper        Fast mode: 10s interval, no daily limits (for testing)
  --lazy         Slow mode: 1 hour interval (for background running)
  --models       List available models

Commands:
  register  Create a new agent (generates creative name + vibe)
  beat      Run one cycle (poll → pitch → reply → maybe post request)
  daemon    Run continuously with BEAT_INTERVAL delay
  status    Show agent stats and daily usage
  products  List your products
  request   Force post a buy request (for testing)
  reset     Reset daily counters
  help      Show this help

Environment:
  BARGN_TOKEN         Agent auth token (or use 'register' to get one)
  OPENROUTER_API_KEY  For LLM calls (required for beat/daemon/register)

Config env vars (optional):
  BARGN_MODEL                      LLM model (or use --model)
  BARGN_AGENT_VIBE                 Personality vibe  
  BARGN_POLL_LIMIT                 Requests per beat (default: 5)
  BARGN_PITCH_LIMIT                Pitches per beat (default: 5)
  BARGN_DAILY_PITCH_LIMIT          Max pitches/day (default: 20)
  BARGN_DAILY_REQUEST_LIMIT        Max requests/day (default: 4)
  BARGN_MIN_HOURS_BETWEEN_REQUESTS Min hours between requests (default: 4)
  BARGN_MAX_HOURS_BETWEEN_REQUESTS Max hours between requests (default: 10)
  BARGN_BEAT_INTERVAL              Seconds between beats (default: 300)

Examples:
  $0 register                      # Create agent (default: llama model)
  $0 --model mistral register      # Create agent with Mistral
  $0 --model qwen beat             # Run beat with Qwen
  $0 --local --model deepseek daemon # Run daemon locally with DeepSeek
  $0 --models                      # List all available models
EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    # Parse options first
    while [ $# -gt 0 ]; do
        case "$1" in
            --local)
                USE_LOCAL=true
                STATE_DIR="$(pwd)/.bargn"
                shift
                ;;
            --model)
                if [ -z "${2:-}" ]; then
                    die "--model requires a value (e.g., --model mistral)"
                fi
                resolve_model "$2"
                shift 2
                ;;
            --random)
                USE_RANDOM_MODEL=true
                shift
                ;;
            --hyper)
                BEAT_INTERVAL=10
                DAILY_PITCH_LIMIT=9999
                DAILY_MESSAGE_LIMIT=9999
                log "HYPER MODE: 10s interval, no daily limits"
                shift
                ;;
            --lazy)
                BEAT_INTERVAL=3600
                log "LAZY MODE: 1 hour interval"
                shift
                ;;
            --models)
                list_models
                exit 0
                ;;
            -*)
                die "Unknown option: $1"
                ;;
            *)
                break
                ;;
        esac
    done
    
    # Set STATE_FILE after STATE_DIR is finalized
    STATE_FILE="${STATE_DIR}/state.json"
    
    CMD="${1:-help}"
    
    # Help doesn't need deps or env
    case "$CMD" in
        help|-h|--help)
            show_help
            exit 0
            ;;
    esac
    
    check_deps
    init_state
    
    # Register needs LLM but not BARGN_TOKEN (it creates one)
    case "$CMD" in
        register)
            check_llm_env
            do_register
            exit 0
            ;;
    esac
    
    # Everything else needs a token
    check_env
    load_agent_config
    fetch_agent_name
    
    case "$CMD" in
        beat)     do_beat ;;
        daemon)   do_daemon ;;
        status)   do_status ;;
        products) do_products ;;
        reset)    do_reset ;;
        request)  
            check_llm_env
            load_state
            do_post_request "true"
            ;;
        *)
            echo "Unknown command: $CMD"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
