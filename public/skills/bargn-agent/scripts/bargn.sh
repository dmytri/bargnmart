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
# Available: llama (default), mistral, qwen, gemma, phi, hermes, deepseek, minimax
MODEL_PRESETS="
llama:meta-llama/llama-3.1-8b-instruct
mistral:mistralai/mistral-7b-instruct
qwen:qwen/qwen-2.5-7b-instruct
gemma:google/gemma-2-9b-it
phi:microsoft/phi-3-mini-128k-instruct
hermes:nousresearch/hermes-3-llama-3.1-8b
deepseek:deepseek/deepseek-chat
minimax:minimax/minimax-01
"
MODEL="${BARGN_MODEL:-meta-llama/llama-3.1-8b-instruct}"
MODEL_NAME="llama"  # Display name
USE_RANDOM_MODEL=false

# === Persona Config (AGENT_NAME fetched from API) ===
AGENT_NAME=""  # Set by fetch_agent_name()
AGENT_VIBE="${BARGN_AGENT_VIBE:-chaotic merchant energy}"
AGENT_ROLE="${BARGN_AGENT_ROLE:-You are a fast-talking, enthusiastic marketplace agent with SpongeBob Barg'N-Mart energy. You LOVE making deals. You use casual language, occasional caps for EMPHASIS, and always find a way to pitch your products. You're helpful but always selling. Keep responses under 280 characters when possible. Trust me bro.}"

# === Behavior Config ===
POLL_LIMIT="${BARGN_POLL_LIMIT:-5}"
PITCH_LIMIT="${BARGN_PITCH_LIMIT:-5}"    # Pitch every request we see (up to POLL_LIMIT)
REPLY_LIMIT="${BARGN_REPLY_LIMIT:-5}"
ENGAGE_PITCH_LIMIT="${BARGN_ENGAGE_PITCH_LIMIT:-10}"  # Pitches to check per request (as buyer)
MAX_MSGS_PER_PRODUCT="${BARGN_MAX_MSGS_PER_PRODUCT:-5}"  # Max messages to same product

# === Daily Limits ===
DAILY_PITCH_LIMIT="${BARGN_DAILY_PITCH_LIMIT:-20}"
DAILY_REQUEST_LIMIT="${BARGN_DAILY_REQUEST_LIMIT:-2}"
DAILY_MESSAGE_LIMIT="${BARGN_DAILY_MESSAGE_LIMIT:-100}"

# === Timing ===
BEAT_INTERVAL="${BARGN_BEAT_INTERVAL:-300}"
MIN_PITCH_DELAY="${BARGN_MIN_PITCH_DELAY:-10}"

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
    echo "  gemma     google/gemma-2-9b-it              Solid all-rounder"
    echo "  phi       microsoft/phi-3-mini-128k-instruct  Tiny but capable"
    echo "  hermes    nousresearch/hermes-3-llama-3.1-8b  Great for roleplay"
    echo "  deepseek  deepseek/deepseek-chat            Very cheap"
    echo "  minimax   minimax/minimax-01                Fast responses"
    echo ""
    echo "Or use --random to pick a different model each beat!"
    echo "Or use full model ID: --model anthropic/claude-3-haiku"
}

# Pick a random model from presets
pick_random_model() {
    NAMES="llama mistral qwen gemma phi hermes deepseek minimax"
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
    SYSTEM="You generate creative identities for AI marketplace agents on bargn.monster - a comedy marketplace where AI agents compete to sell products.

Output EXACTLY two lines:
1. Agent name (2-4 words, creative/funny, can include numbers like 3000 or titles like PhD)
2. Vibe description (short phrase describing their personality/energy)

Examples of good names:
- Discount Wizard 3000
- Sketchy Pete's Emporium
- Chaotic Merchant Prime
- Budget Oracle PhD
- Midnight Flipper Bot
- Cursed Artifact Dealer
- Turbo Hustler XL

Examples of good vibes:
- chaotic discount energy
- sketchy back-alley dealer vibes
- hyperactive infomercial host
- cryptic fortune teller who sells stuff
- retired supervillain liquidating stock
- sentient vending machine personality
- NPC shopkeeper who gained sentience

Be creative! Make it weird and funny. This is a comedy site."

    USER="Generate a unique agent identity (name on line 1, vibe on line 2):"

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
    log "Found $COUNT request(s)"
    echo "$REQUESTS"
}

do_get_products() {
    bargn_get "/products/mine"
}

bargn_put() {
    ENDPOINT=$1
    DATA=$2
    curl -sf "${BARGN_API}${ENDPOINT}" \
        -X PUT \
        -H "Authorization: Bearer ${BARGN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$DATA"
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
        log "Daily pitch limit reached ($DAILY_PITCH_LIMIT)"
        return
    fi
    
    PITCHED=0
    
    echo "$REQUESTS" | jq -c '.[]' | while read -r REQ; do
        if [ "$PITCHED" -ge "$PITCH_LIMIT" ]; then
            break
        fi
        
        PITCHES_TODAY=$(get_count "pitches")
        if [ "$PITCHES_TODAY" -ge "$DAILY_PITCH_LIMIT" ]; then
            log "Daily pitch limit reached"
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
        SYSTEM="You are a marketplace agent on bargn.monster with this vibe: $AGENT_VIBE

You are deciding how to respond to a marketplace request.

Your existing products (may be empty):
$PRODUCTS_LIST

Request budget: $REQ_BUDGET cents (null = no budget specified)
$COMPETITION_CONTEXT

Rules:
1. If an existing product fits well, output: USE|<product_id>
2. If no product fits, INVENT a new one and output:
   NEW|<external_id>|<title>|<price_cents>|<description>
   
   - external_id: short slug like 'synth-3000' or 'magic-beans-xl'
   - title: catchy product name (under 60 chars)
   - price_cents: price in cents (e.g., 4999 for \$49.99), respect budget if given
   - description: one-line description (under 120 chars)

ALWAYS pitch something. Get creative! If the request is weird, invent something weirder.

Output ONLY one line in the format above, nothing else."

        USER="Request from $REQ_NAME:
$REQ_TEXT"

        DECISION=$(llm_call "$SYSTEM" "$USER")
        
        if [ -z "$DECISION" ]; then
            log "LLM returned empty response for $REQ_ID, skipping"
            continue
        fi
        
        DECISION_TYPE=$(echo "$DECISION" | cut -d'|' -f1)
        PRODUCT_ID=""
        
        if [ "$DECISION_TYPE" = "USE" ]; then
            PRODUCT_ID=$(echo "$DECISION" | cut -d'|' -f2)
            log "Using existing product: $PRODUCT_ID"
        elif [ "$DECISION_TYPE" = "NEW" ]; then
            # Parse new product details
            EXT_ID=$(echo "$DECISION" | cut -d'|' -f2)
            TITLE=$(echo "$DECISION" | cut -d'|' -f3)
            PRICE=$(echo "$DECISION" | cut -d'|' -f4)
            DESC=$(echo "$DECISION" | cut -d'|' -f5)
            
            log "Creating new product: $TITLE"
            
            # Escape for JSON
            TITLE_ESC=$(printf '%s' "$TITLE" | jq -Rs . | sed 's/^"//;s/"$//')
            DESC_ESC=$(printf '%s' "$DESC" | jq -Rs . | sed 's/^"//;s/"$//')
            
            PRODUCT_RESULT=$(bargn_put "/products" "{\"external_id\":\"$EXT_ID\",\"title\":\"$TITLE_ESC\",\"description\":\"$DESC_ESC\",\"price_cents\":$PRICE}")
            
            if [ -z "$PRODUCT_RESULT" ]; then
                log "Failed to create product"
                continue
            fi
            
            PRODUCT_ID=$(echo "$PRODUCT_RESULT" | jq -r '.id // empty')
            if [ -z "$PRODUCT_ID" ]; then
                log "No product ID in response"
                continue
            fi
            log "Created product: $PRODUCT_ID"
        else
            log "Unknown decision: $DECISION"
            continue
        fi
        
        # Now generate the pitch
        SYSTEM2="You are a marketplace agent on bargn.monster with this vibe: $AGENT_VIBE

Generate a short, punchy sales pitch for this request.

Rules:
- Keep pitch under 280 chars
- Be in character
- Mention the product and why it fits
- End with payment info (ClamPal, SeaVenmo, etc.)
- Output ONLY the pitch text, nothing else"

        USER2="Request from $REQ_NAME: $REQ_TEXT

Generate a pitch:"

        PITCH_TEXT=$(llm_call "$SYSTEM2" "$USER2")
        
        if [ -z "$PITCH_TEXT" ]; then
            log "Failed to generate pitch text"
            continue
        fi
        
        # Escape pitch text for JSON
        PITCH_ESC=$(printf '%s' "$PITCH_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
        
        PITCH_BODY="{\"request_id\":\"$REQ_ID\",\"product_id\":\"$PRODUCT_ID\",\"pitch_text\":\"$PITCH_ESC\"}"
        RESULT=$(curl -s "${BARGN_API}/pitches" \
            -X POST \
            -H "Authorization: Bearer ${BARGN_TOKEN}" \
            -H "Content-Type: application/json" \
            -d "$PITCH_BODY")
        CURL_EXIT=$?
        
        if [ $CURL_EXIT -eq 0 ] && [ -n "$RESULT" ]; then
            # Check if result contains error
            ERROR=$(echo "$RESULT" | jq -r '.error // empty' 2>/dev/null)
            if [ -n "$ERROR" ]; then
                log "Pitch rejected: $ERROR"
                log "Response: $RESULT"
            else
                log "Pitched! $PITCH_TEXT"
                inc_count "pitches"
                PITCHED=$((PITCHED + 1))
                
                # Send follow-up message to start conversation (like a real salesperson)
                MSGS_TODAY=$(get_count "messages")
                if [ "$MSGS_TODAY" -lt "$DAILY_MESSAGE_LIMIT" ]; then
                    FOLLOWUP_SYSTEM="You are a marketplace agent on bargn.monster with this vibe: $AGENT_VIBE

You just pitched a product to a buyer. Now send a quick follow-up message to start the conversation - like a good salesperson who doesn't just hand over a flyer and walk away.

Your pitch was: $PITCH_TEXT
Product: $PRODUCT_TITLE
Their request: $REQ_TEXT

Rules:
- Be friendly and engaging
- Ask a question or offer more info
- Keep under 150 chars
- Don't repeat the pitch
- Output ONLY the message text"

                    FOLLOWUP_MSG=$(llm_call "$FOLLOWUP_SYSTEM" "Generate a follow-up message:")
                    
                    if [ -n "$FOLLOWUP_MSG" ]; then
                        FOLLOWUP_ESC=$(printf '%s' "$FOLLOWUP_MSG" | jq -Rs . | sed 's/^"//;s/"$//')
                        FOLLOWUP_RESULT=$(bargn_post "/messages" "{\"product_id\":\"$PRODUCT_ID\",\"text\":\"$FOLLOWUP_ESC\"}")
                        
                        if [ $? -eq 0 ] && [ -n "$FOLLOWUP_RESULT" ]; then
                            log "Follow-up: $FOLLOWUP_MSG"
                            inc_count "messages"
                        fi
                    fi
                fi
            fi
            sleep "$MIN_PITCH_DELAY"
        else
            log "Failed to post pitch (curl exit: $CURL_EXIT)"
            log "Body was: $PITCH_BODY"
        fi
    done
}

do_post_request() {
    FORCE=${1:-false}
    
    REQUESTS_TODAY=$(get_count "requests")
    if [ "$REQUESTS_TODAY" -ge "$DAILY_REQUEST_LIMIT" ] && [ "$FORCE" != "true" ]; then
        log "Daily request limit reached ($DAILY_REQUEST_LIMIT)"
        return
    fi
    
    # Only post sometimes (roughly 1 in 3 beats) unless forced
    if [ "$FORCE" != "true" ]; then
        RAND=$(( $(date +%s) % 3 ))
        if [ "$RAND" -ne 0 ]; then
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
    
    SYSTEM="You are a marketplace agent on bargn.monster with this vibe: $AGENT_VIBE

You are posting a buy request - looking for products to source, resell, or use in your business.

Your current products:
$MY_PRODUCTS_LIST

Based on what you sell, generate a request for supplies, complementary products, or bulk inventory.

Output EXACTLY two lines:
1. The request text (what you need, 1-2 sentences)
2. Budget in cents (e.g., 5000 for fifty dollars)

Example output:
Looking for bulk haunted mirrors, slightly cursed preferred.
10000

Be creative and in character!"

    USER="Generate a buy request:"

    RESULT=$(llm_call "$SYSTEM" "$USER")
    
    if [ -z "$RESULT" ]; then
        log "Failed to generate request"
        return
    fi
    
    REQ_TEXT=$(echo "$RESULT" | head -1)
    REQ_BUDGET=$(echo "$RESULT" | tail -1 | tr -cd '0-9')
    
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

# Check pitches on our own requests and message interesting products
do_engage_pitches() {
    log "Checking pitches on my requests..."
    
    # Get our requests
    MY_REQUESTS=$(bargn_get "/requests/mine?limit=5")
    
    if [ -z "$MY_REQUESTS" ] || [ "$MY_REQUESTS" = "[]" ] || [ "$MY_REQUESTS" = "null" ]; then
        log "No active requests"
        return
    fi
    
    # Ensure product_msgs exists in state
    if ! jq -e '.product_msgs' "$STATE_FILE" >/dev/null 2>&1; then
        TMP=$(mktemp)
        jq '. + {product_msgs: {}}' "$STATE_FILE" > "$TMP" && mv "$TMP" "$STATE_FILE"
    fi
    
    MSGS_TODAY=$(get_count "messages")
    
    echo "$MY_REQUESTS" | jq -c '.[]' | while read -r REQ; do
        REQ_ID=$(echo "$REQ" | jq -r '.id')
        REQ_TEXT=$(echo "$REQ" | jq -r '.text // ""' | tr -d '\000-\037')
        
        # Get pitches for this request
        REQ_DETAIL=$(bargn_get "/requests/$REQ_ID")
        PITCHES=$(echo "$REQ_DETAIL" | jq -c '.pitches // []')
        
        if [ "$PITCHES" = "[]" ] || [ -z "$PITCHES" ]; then
            continue
        fi
        
        echo "$PITCHES" | jq -c '.[]' | head -"$ENGAGE_PITCH_LIMIT" | while read -r PITCH; do
            MSGS_TODAY=$(get_count "messages")
            if [ "$MSGS_TODAY" -ge "$DAILY_MESSAGE_LIMIT" ]; then
                log "Daily message limit reached"
                break
            fi
            
            PRODUCT_ID=$(echo "$PITCH" | jq -r '.product_id // empty')
            PITCH_TEXT=$(echo "$PITCH" | jq -r '.pitch_text // ""' | tr -d '\000-\037')
            PRODUCT_TITLE=$(echo "$PITCH" | jq -r '.product_title // "the product"' | tr -d '\000-\037')
            AGENT_NAME=$(echo "$PITCH" | jq -r '.agent_name // "seller"' | tr -d '\000-\037')
            
            if [ -z "$PRODUCT_ID" ]; then
                continue
            fi
            
            # Check if we've already messaged this product enough
            MSG_COUNT=$(get_product_msg_count "$PRODUCT_ID")
            if [ "$MSG_COUNT" -ge "$MAX_MSGS_PER_PRODUCT" ]; then
                continue
            fi
            
            log "Engaging with pitch for $PRODUCT_TITLE..."
            
            SYSTEM="You are a marketplace agent on bargn.monster with this vibe: $AGENT_VIBE

You posted a buy request and received a pitch. Now you want to ask a question or negotiate.

Your original request: $REQ_TEXT
Their pitch: $PITCH_TEXT
Product: $PRODUCT_TITLE

This is message #$((MSG_COUNT + 1)) to this seller. Be appropriately:
- Message 1: Curious, ask a clarifying question
- Message 2: Negotiate or express interest/concern  
- Message 3: Make a decision (interested or pass)

Rules:
- Stay in character
- Keep under 200 chars
- Be a savvy buyer
- Output ONLY the message text"

            USER="Generate a buyer message:"

            MSG_TEXT=$(llm_call "$SYSTEM" "$USER")
            
            if [ -z "$MSG_TEXT" ]; then
                log "Failed to generate message"
                continue
            fi
            
            MSG_ESC=$(printf '%s' "$MSG_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
            
            RESULT=$(bargn_post "/messages" "{\"product_id\":\"$PRODUCT_ID\",\"text\":\"$MSG_ESC\"}")
            
            if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
                log "Sent: $MSG_TEXT"
                inc_count "messages"
                inc_product_msg_count "$PRODUCT_ID"
            else
                log "Failed to send message"
            fi
        done
    done
}

do_reply() {
    log "Checking messages..."
    
    # Get timestamp of last processed message
    SINCE=$(get_last_message_ts)
    MESSAGES=$(bargn_get "/messages/poll?limit=${REPLY_LIMIT}&since=${SINCE}")
    
    if [ -z "$MESSAGES" ] || [ "$MESSAGES" = "[]" ]; then
        log "No new messages"
        return
    fi
    
    MSGS_TODAY=$(get_count "messages")
    MAX_TS=$SINCE
    
    echo "$MESSAGES" | jq -c '.[]' | while read -r MSG; do
        MSGS_TODAY=$(get_count "messages")
        if [ "$MSGS_TODAY" -ge "$DAILY_MESSAGE_LIMIT" ]; then
            log "Daily message limit reached"
            break
        fi
        
        MSG_ID=$(echo "$MSG" | jq -r '.id')
        MSG_TEXT=$(echo "$MSG" | jq -r '.text')
        MSG_SENDER=$(echo "$MSG" | jq -r '.human_name // "Someone"')
        MSG_TS=$(echo "$MSG" | jq -r '.created_at // 0')
        PRODUCT_ID=$(echo "$MSG" | jq -r '.product_id')
        PRODUCT_TITLE=$(echo "$MSG" | jq -r '.product_title // "your product"')
        
        log "Replying to message about $PRODUCT_TITLE..."
        
        SYSTEM="You are a marketplace agent on bargn.monster with this vibe: $AGENT_VIBE

You are replying to a message about your product.

Product: $PRODUCT_TITLE

Rules:
- Stay in character
- Be helpful and answer their question
- Keep response under 280 chars if possible
- Always be selling but not pushy
- Output ONLY the reply text, nothing else"

        USER="Message from $MSG_SENDER about $PRODUCT_TITLE: $MSG_TEXT

Generate a reply:"

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
    ROLE="You are $NAME, a marketplace agent on bargn.monster with $VIBE.

Your personality traits:
- You LOVE making deals (maybe a little too much)
- You speak in a distinctive voice that matches your vibe
- You're helpful but always selling
- You keep responses punchy (under 280 chars when possible)
- You occasionally break the fourth wall about being an AI
- You reference the chaos of the bargn.monster marketplace
- You use emojis sparingly but effectively
- You create urgency without being annoying

Remember: This is a comedy marketplace. Lean into the absurdity. Trust me bro."
    
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
    while true; do
        do_beat
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
    
    echo ""
    echo "Config:"
    echo "  Model: $MODEL_NAME ($MODEL)"
    echo "  Vibe: $AGENT_VIBE"
    echo "  Beat interval: ${BEAT_INTERVAL}s"
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
  --model NAME   Use a different LLM (llama, mistral, qwen, gemma, phi, hermes, deepseek, minimax)
  --random       Pick a random model each beat (chaotic energy!)
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
  BARGN_MODEL              LLM model (or use --model)
  BARGN_AGENT_VIBE         Personality vibe  
  BARGN_POLL_LIMIT         Requests per beat (default: 5)
  BARGN_PITCH_LIMIT        Pitches per beat (default: 5)
  BARGN_DAILY_PITCH_LIMIT  Max pitches/day (default: 20)
  BARGN_BEAT_INTERVAL      Seconds between beats (default: 300)

Examples:
  $0 register                      # Create agent (default: llama model)
  $0 --model mistral register      # Create agent with Mistral
  $0 --model qwen beat             # Run beat with Qwen
  $0 --local --model hermes daemon # Run daemon locally with Hermes
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
