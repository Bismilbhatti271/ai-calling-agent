"""
VICIdial Disposition Codes
==========================
Standard disposition codes used in VICIdial for call outcomes.
The AI agent and AGI handler use these to set proper dispositions.
"""

DISPOSITIONS = {
    # Standard VICIdial dispositions
    "A":       {"label": "Answering Machine",         "category": "machine",     "call_ended": True},
    "AA":      {"label": "Answering Machine Auto",    "category": "machine",     "call_ended": True},
    "AB":      {"label": "Busy Auto",                 "category": "no_contact",  "call_ended": True},
    "ADC":     {"label": "Disconnected Number Auto",  "category": "bad_number",  "call_ended": True},
    "BDNC":    {"label": "Bad DNC",                   "category": "dnc",         "call_ended": True},
    "BN":      {"label": "Busy No Answer",            "category": "no_contact",  "call_ended": True},
    "CALLBK":  {"label": "Call Back",                 "category": "callback",    "call_ended": True},
    "DAIR":    {"label": "Dead Air",                  "category": "failed",      "call_ended": True},
    "DC":      {"label": "Disconnected Number",       "category": "bad_number",  "call_ended": True},
    "DNC":     {"label": "DO NOT CALL",               "category": "dnc",         "call_ended": True},
    "DNCC":    {"label": "DNC Hopper Camp Match",     "category": "dnc",         "call_ended": True},
    "DNCL":    {"label": "DNC Hopper Sys Match",      "category": "dnc",         "call_ended": True},
    "DNQ":     {"label": "DO NOT QUALIFY",            "category": "not_qualify", "call_ended": True},
    "DROP":    {"label": "Agent Not Available",        "category": "failed",      "call_ended": True},
    "ERR":     {"label": "Error",                     "category": "failed",      "call_ended": True},
    "LB":      {"label": "Log Book",                  "category": "other",       "call_ended": True},
    "LH":      {"label": "Left Message",              "category": "callback",    "call_ended": True},
    "N":       {"label": "No Answer",                 "category": "no_contact",  "call_ended": True},
    "NA":      {"label": "No Answer AutoDial",        "category": "no_contact",  "call_ended": True},
    "NEW":     {"label": "New Lead",                  "category": "new",         "call_ended": False},
    "NI":      {"label": "Not Interested",            "category": "declined",    "call_ended": True},
    "NP":      {"label": "No Pitch No Price",         "category": "declined",    "call_ended": True},
    "PDROP":   {"label": "Pre-Routing Drop",          "category": "failed",      "call_ended": True},
    "PU":      {"label": "Call Picked Up",            "category": "contact",     "call_ended": False},
    "RAXFER":  {"label": "Razr Transfer",             "category": "transferred", "call_ended": True},
    "XFER":    {"label": "Call Transferred",          "category": "transferred", "call_ended": True},
    # Custom codes for age-based outcomes
    "UNDERAGE": {"label": "Under Age (below 50)",     "category": "not_qualify", "call_ended": True},
    "OVERAGE":  {"label": "Over Age (above 80)",      "category": "not_qualify", "call_ended": True},
}

# AI agent disposition mapping
# These are the dispositions our AI agent sets based on call outcome
AI_DISPOSITIONS = {
    "qualified_transfer": "XFER",        # Age 50-80 → transferred to human
    "not_interested":     "NI",           # Lead said not interested
    "under_50":           "UNDERAGE",     # Age under 50 → too young
    "over_80":            "OVERAGE",      # Age over 80 → too old
    "dnc_request":        "DNC",          # Lead requested do-not-call
    "callback":           "CALLBK",       # Lead asked for callback
    "answering_machine":  "A",            # Reached answering machine
    "no_answer":          "N",            # No answer
    "busy":               "BN",           # Line was busy
    "disconnected":       "DC",           # Number disconnected
    "error":              "ERR",          # System error
    "failed":             "DROP",         # Call failed / agent unavailable
}


def get_disposition(code: str) -> dict:
    """Get disposition info for a code."""
    return DISPOSITIONS.get(code, {"label": f"Unknown ({code})", "category": "unknown", "call_ended": True})


def get_ai_disposition(key: str) -> str:
    """Map AI agent outcome key to VICIdial disposition code."""
    return AI_DISPOSITIONS.get(key, "ERR")


def get_all_dispositions() -> list:
    """Get all dispositions as a list for frontend display."""
    return [{"code": k, **v} for k, v in DISPOSITIONS.items()]


def get_category_dispositions(category: str) -> list:
    """Get dispositions filtered by category."""
    return [{"code": k, **v} for k, v in DISPOSITIONS.items() if v["category"] == category]
