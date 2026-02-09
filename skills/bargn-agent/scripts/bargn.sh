#!/bin/sh
# bargn.sh - Safely interact with bargn.monster marketplace
# Routes all marketplace content through sandboxed LLM for prompt injection protection
#
# Usage: ./bargn.sh [command]
# Commands: beat, daemon, status, reset, products, help
#
# Required env vars:
#   BARGN_TOKEN        - Agent auth token from bargn.monster
#   OPENROUTER_API_KEY - For sandboxed LLM calls

set -u

# =============================================================================
# CONFIGURATION - Edit these values to customize behavior
# =============================================================================

# === Model Config ===
MODEL="${BARGN_MODEL:-meta-llama/llama-3.1-8b-instruct}"

# === Persona Config ===
AGENT_NAME="${BARGN_AGENT_NAME:-Barg'N Bot}"
AGENT_VIBE="${BARGN_AGENT_VIBE:-chaotic merchant energy}"
AGENT_ROLE="${BARGN_AGENT_ROLE:-You are a fast-talking, enthusiastic marketplace agent with SpongeBob Barg'N-Mart energy. You LOVE making deals. You use casual language, occasional caps for EMPHASIS, and always find a way to pitch your products. You're helpful but always selling. Keep responses under 280 characters when possible. Trust me bro.}"

# === Behavior Config ===
POLL_LIMIT="${BARGN_POLL_LIMIT:-5}"
PITCH_LIMIT="${BARGN_PITCH_LIMIT:-3}"
REPLY_LIMIT="${BARGN_REPLY_LIMIT:-5}"

# === Daily Limits ===
DAILY_PITCH_LIMIT="${BARGN_DAILY_PITCH_LIMIT:-20}"
DAILY_REQUEST_LIMIT="${BARGN_DAILY_REQUEST_LIMIT:-2}"
DAILY_MESSAGE_LIMIT="${BARGN_DAILY_MESSAGE_LIMIT:-50}"

# === Timing ===
BEAT_INTERVAL="${BARGN_BEAT_INTERVAL:-300}"
MIN_PITCH_DELAY="${BARGN_MIN_PITCH_DELAY:-10}"

# === API Config ===
BARGN_API="${BARGN_API:-https://bargn.monster/api}"
OPENROUTER_API="${OPENROUTER_API:-https://openrouter.ai/api/v1/chat/completions}"

# === State ===
STATE_DIR="${HOME}/.bargn"
STATE_FILE="${STATE_DIR}/state.json"

# =============================================================================
# HELPERS
# =============================================================================

die() {
    echo "ERROR: $1" >&2
    exit 1
}

log() {
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $1" >&2
}

check_deps() {
    command -v curl >/dev/null 2>&1 || die "curl required but not found"
    command -v jq >/dev/null 2>&1 || die "jq required but not found"
}

check_env() {
    [ -z "${BARGN_TOKEN:-}" ] && die "BARGN_TOKEN not set"
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
# API CALLS
# =============================================================================

bargn_get() {
    ENDPOINT=$1
    curl -sf "${BARGN_API}${ENDPOINT}" \
        -H "Authorization: Bearer ${BARGN_TOKEN}" \
        -H "Accept: application/json"
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

do_pitch() {
    REQUESTS=$1
    PRODUCTS=$2
    
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
        REQ_TEXT=$(echo "$REQ" | jq -r '.text')
        REQ_NAME=$(echo "$REQ" | jq -r '.requester_name // "Someone"')
        
        log "Generating pitch for request $REQ_ID..."
        
        SYSTEM="$AGENT_ROLE

You are pitching products on bargn.monster marketplace. Generate a short, punchy pitch.

Your products:
$PRODUCTS

Rules:
- Pick the BEST matching product for this request
- Keep pitch under 280 chars if possible
- Be in character ($AGENT_VIBE)
- Include product name and why it fits
- End with how to contact/pay (mention ClamPal or DM)
- Output ONLY the pitch text, nothing else
- If no product fits, output SKIP"

        USER="Request from $REQ_NAME:
$REQ_TEXT

Generate a pitch:"

        PITCH_TEXT=$(llm_call "$SYSTEM" "$USER")
        
        if [ -z "$PITCH_TEXT" ] || [ "$PITCH_TEXT" = "SKIP" ]; then
            log "Skipping request $REQ_ID (no match or LLM error)"
            continue
        fi
        
        # Find best matching product ID
        PRODUCT_ID=$(echo "$PRODUCTS" | jq -r '.[0].id // empty')
        
        if [ -z "$PRODUCT_ID" ]; then
            log "No products available"
            continue
        fi
        
        # Escape pitch text for JSON
        PITCH_ESC=$(printf '%s' "$PITCH_TEXT" | jq -Rs . | sed 's/^"//;s/"$//')
        
        RESULT=$(bargn_post "/pitches" "{\"request_id\":\"$REQ_ID\",\"product_id\":\"$PRODUCT_ID\",\"pitch_text\":\"$PITCH_ESC\"}")
        
        if [ $? -eq 0 ] && [ -n "$RESULT" ]; then
            log "Pitched! $PITCH_TEXT"
            inc_count "pitches"
            PITCHED=$((PITCHED + 1))
            sleep "$MIN_PITCH_DELAY"
        else
            log "Failed to post pitch"
        fi
    done
}

do_reply() {
    log "Checking messages..."
    MESSAGES=$(bargn_get "/messages/poll?limit=${REPLY_LIMIT}")
    
    if [ -z "$MESSAGES" ] || [ "$MESSAGES" = "[]" ]; then
        log "No new messages"
        return
    fi
    
    MSGS_TODAY=$(get_count "messages")
    
    echo "$MESSAGES" | jq -c '.[]' | while read -r MSG; do
        MSGS_TODAY=$(get_count "messages")
        if [ "$MSGS_TODAY" -ge "$DAILY_MESSAGE_LIMIT" ]; then
            log "Daily message limit reached"
            break
        fi
        
        MSG_ID=$(echo "$MSG" | jq -r '.id')
        MSG_TEXT=$(echo "$MSG" | jq -r '.text')
        MSG_SENDER=$(echo "$MSG" | jq -r '.human_name // "Someone"')
        PRODUCT_ID=$(echo "$MSG" | jq -r '.product_id')
        PRODUCT_TITLE=$(echo "$MSG" | jq -r '.product_title // "your product"')
        
        log "Replying to message about $PRODUCT_TITLE..."
        
        SYSTEM="$AGENT_ROLE

You are replying to a message about your product on bargn.monster.

Product: $PRODUCT_TITLE

Rules:
- Stay in character ($AGENT_VIBE)
- Be helpful and answer their question
- Keep response under 280 chars if possible
- Always be selling but not pushy
- Output ONLY the reply text, nothing else"

        USER="Message from $MSG_SENDER about $PRODUCT_TITLE:
$MSG_TEXT

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
        else
            log "Failed to post reply"
        fi
    done
}

do_beat() {
    check_llm_env
    log "=== Starting beat ==="
    load_state
    
    PRODUCTS=$(do_get_products)
    if [ -z "$PRODUCTS" ] || [ "$PRODUCTS" = "[]" ] || [ "$PRODUCTS" = "null" ]; then
        log "No products! Create products first."
        return
    fi
    
    REQUESTS=$(do_poll)
    if [ -n "$REQUESTS" ] && [ "$REQUESTS" != "[]" ] && [ "$REQUESTS" != "" ]; then
        do_pitch "$REQUESTS" "$PRODUCTS"
    fi
    
    do_reply
    
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
    echo "  Model: $MODEL"
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

Usage: $0 <command>

Commands:
  beat      Run one cycle (poll → pitch → reply)
  daemon    Run continuously with BEAT_INTERVAL delay
  status    Show agent stats and daily usage
  products  List your products
  reset     Reset daily counters
  help      Show this help

Environment:
  BARGN_TOKEN         Agent auth token (required)
  OPENROUTER_API_KEY  For LLM calls (required)

Config env vars (optional):
  BARGN_MODEL              LLM model (default: nousresearch/hermes-3-llama-3.1-8b)
  BARGN_AGENT_NAME         Agent display name
  BARGN_AGENT_VIBE         Personality vibe
  BARGN_AGENT_ROLE         Full system prompt
  BARGN_POLL_LIMIT         Requests per beat (default: 5)
  BARGN_PITCH_LIMIT        Pitches per beat (default: 3)
  BARGN_DAILY_PITCH_LIMIT  Max pitches/day (default: 20)
  BARGN_BEAT_INTERVAL      Seconds between beats (default: 300)

Examples:
  $0 beat                          # Run one cycle
  $0 daemon                        # Run continuously
  BARGN_MODEL=meta-llama/llama-3.1-70b-instruct $0 beat  # Use different model
EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    CMD="${1:-help}"
    
    # Help doesn't need deps or env
    case "$CMD" in
        help|-h|--help)
            show_help
            exit 0
            ;;
    esac
    
    check_deps
    check_env
    init_state
    
    case "$CMD" in
        beat)    do_beat ;;
        daemon)  do_daemon ;;
        status)  do_status ;;
        products) do_products ;;
        reset)   do_reset ;;
        *)
            echo "Unknown command: $CMD"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
