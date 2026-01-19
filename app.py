import streamlit as st
import pandas as pd
import gspread
from google.oauth2.service_account import Credentials
import os
import requests
import pycountry
import urllib.parse
import hashlib
import time
import io
import re
import math

try:
    from PIL import Image
except Exception:
    Image = None


# ======================================================
# ADMIN IMAGE CONTROL — MINIMAL ADDITIONS (SAFE)
# ======================================================

# Private admin allowlist (no UI exposure)
ADMIN_EMAILS = {
    "nitinjoshi4u@gmail.com",  # replace with real admin email(s)
}

def is_admin():
    if not hasattr(st, "user"):
        return False
    if not getattr(st.user, "email", None):
        return False
    return st.user.email in ADMIN_EMAILS

# Stable helper (NOT wired yet)
def image_version_key(name: str) -> str:
    h = hashlib.sha256(name.encode("utf-8")).hexdigest()
    return f"img_v_{h}"


# --- 1. CONFIG & STYLING ---

st.set_page_config(
    page_title="DramTrack Pro",
    layout="wide",
    page_icon="🥃",
)


# --- 2. DATA ENGINES ---
@st.cache_resource(show_spinner=False)
def get_gspread_client():
    scope = [
        "https://spreadsheets.google.com/feeds",
        "https://www.googleapis.com/auth/drive",
    ]
    creds_dict = dict(st.secrets["gcp_service_account"])
    credentials = Credentials.from_service_account_info(creds_dict, scopes=scope)
    return gspread.authorize(credentials)

@st.cache_data(ttl=3600, show_spinner=False)
def fetch_master_library():
    """Fetch and sort master library by Rating DESC, Value DESC, Count DESC, Price ASC, Name ASC."""
    try:
        client = get_gspread_client()
        sheet = client.open("Your Next Whiskey").worksheet("Whiskeys")
        raw_data = sheet.get_all_values()

        df = pd.DataFrame(raw_data[1:], columns=None)
        df = df.iloc[:, :6]
        df.columns = ["Name", "Rating", "Count", "Price", "Value", "Distillery"]

        df["Rating_Num"] = (
            pd.to_numeric(df["Rating"], errors="coerce")
            .fillna(0.0)
        )
        df["Count_Num"] = (
            pd.to_numeric(df["Count"], errors="coerce")
            .fillna(0)
            .astype(int)
        )
        df["Price_Num"] = (
            pd.to_numeric(
                df["Price"]
                .astype(str)
                .str.replace(r"[^\d.]", "", regex=True),
                errors="coerce",
            )
            .fillna(0.0)
        )
        df["Value_Num"] = (
            pd.to_numeric(df["Value"], errors="coerce")
            .fillna(0.0)
        )
        df["Name_norm"] = (
            df["Name"]
            .astype(str)
            .str.strip()
            .str.lower()
        )

        df = df.sort_values(
            by=["Rating_Num", "Value_Num", "Count_Num", "Price_Num", "Name"],
            ascending=[False, False, False, True, True],
        ).reset_index(drop=True)

        return df

    except Exception as e:
        st.error(f"Library Sync Error: {e}")
        return pd.DataFrame(
            columns=[
                "Name",
                "Rating",
                "Count",
                "Price",
                "Value",
                "Distillery",
            ]
        )

def get_recommendations(
    df_lib: pd.DataFrame,
    df_personal: pd.DataFrame,
    n: int = 5,
) -> pd.DataFrame:
    """Return up to `n` recommendations based on the user's top-ranked whiskey."""
    if df_lib is None or df_lib.empty:
        return pd.DataFrame()

    lib = df_lib.copy()

    lib["Rating_Num"] = pd.to_numeric(
        lib["Rating"],
        errors="coerce",
    ).fillna(0.0)

    lib["Value_Num"] = pd.to_numeric(
        lib["Value"],
        errors="coerce",
    ).fillna(0.0)

    lib["Name_norm"] = (
        lib["Name"]
        .astype(str)
        .str.strip()
        .str.lower()
    )

    user_names = [
        n.strip().lower()
        for n in df_personal["Name"].tolist()
    ]

    ignored_names = [
        n.strip().lower()
        for n in st.session_state.get("ignored_list", [])
    ]

    exclude_set = set(user_names + ignored_names)

    if df_personal.empty:
        candidates = lib[
            ~lib["Name_norm"].isin(exclude_set)
        ].copy()
        return candidates.sort_values(
            "Rating_Num",
            ascending=False,
        ).head(n)

    top_row = df_personal.sort_values("Rank").iloc[0]
    personal_top_score = float(
        top_row.get("Internal_Score", 0.0)
    )

    candidates = lib[
        ~lib["Name_norm"].isin(exclude_set)
    ].copy()

    if candidates.empty:
        return candidates.head(0)

    candidates["diff"] = (
        candidates["Rating_Num"] - personal_top_score
    )

    pos = candidates[candidates["diff"] > 0].copy()

    if not pos.empty:
        pos = pos.sort_values(
            by=["Rating_Num", "Value_Num"],
            ascending=[True, False],
        )
        chosen = pos.head(n)
        if len(chosen) < n:
            remaining = n - len(chosen)
            neg = candidates[candidates["diff"] <= 0].copy()
            neg["absdiff"] = neg["diff"].abs()
            neg = neg.sort_values("absdiff")
            chosen = pd.concat(
                [chosen, neg.head(remaining)]
            )
        return chosen.head(n)

    candidates["absdiff"] = candidates["diff"].abs()
    candidates = candidates.sort_values("absdiff")
    return candidates.head(n)


def get_whiskey_image(key: str) -> str:
    query = urllib.parse.quote(f"{key} whiskey bottle")
    return (
        "https://tse1.mm.bing.net/th?"
        f"q={query}&w=300&h=450&c=7&rs=1&p=0&dpr=1&pid=1.7"
    )


CACHE_DIR = "image_cache"
os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_filename_for(key: str) -> str:
    h = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return os.path.join(CACHE_DIR, f"{h}.png")


def fetch_cached_image_bytes(key: str, ttl_days: int = 30, timeout: int = 10):
    path = _cache_filename_for(key)
    lock = path + ".lock"

    if os.path.exists(path):
        try:
            mtime = os.path.getmtime(path)
            if (time.time() - mtime) < (ttl_days * 86400):
                with open(path, "rb") as f:
                    return f.read()
        except Exception:
            pass

    start = time.time()
    acquired = False

    while time.time() - start < timeout:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            acquired = True
            break
        except FileExistsError:
            time.sleep(0.2)

    if acquired:
        try:
            url = get_whiskey_image(key)
            r = requests.get(url, timeout=5)
            r.raise_for_status()

            final_bytes = r.content
            if Image is not None:
                try:
                    with Image.open(io.BytesIO(r.content)) as im:
                        im = im.convert("RGBA")
                        out = io.BytesIO()
                        im.save(out, format="PNG")
                        final_bytes = out.getvalue()
                except Exception:
                    pass

            tmp = path + ".tmp"
            with open(tmp, "wb") as f:
                f.write(final_bytes)
            os.replace(tmp, path)

            return final_bytes

        finally:
            try:
                if os.path.exists(lock):
                    os.remove(lock)
            except Exception:
                pass

    if os.path.exists(path):
        try:
            with open(path, "rb") as f:
                return f.read()
        except Exception:
            pass

    return None


def delete_cached_image(key: str):
    path = _cache_filename_for(key)
    lock = path + ".lock"

    try:
        if os.path.exists(lock):
            os.remove(lock)
        if os.path.exists(path):
            os.remove(path)
        return True
    except Exception:
        return False

# --- 3. APP INITIALIZATION ---

def initialize_app():
    if "master_library" not in st.session_state:
        st.session_state.master_library = fetch_master_library()


# --- 4. USER CONTEXT & STORAGE ---

def get_user_context():
    is_logged_in = False
    if hasattr(st, "user"):
        try:
            is_logged_in = getattr(st.user, "is_logged_in", False)
        except Exception:
            is_logged_in = False
    if is_logged_in:
        email = getattr(st.user, "email", None)
        name = getattr(st.user, "name", "Guest")
        if email:
            uid = email.replace("@", "_").replace(".", "_")
            return (
                f"user_data/rank__{uid}.csv",
                name,
                True,
            )
    return (
        "guest_rankings.csv",
        "Guest",
        False,
    )


# --- POST LOGIN HANDSHAKE FIX ---

if st.session_state.pop("_login_initiated", False):
    st.rerun()


def load_user_data():
    path, _, logged_in = get_user_context()

    ignore_path = (
        path.replace("rank__", "ignore__")
        if "user_data/" in path
        else "guest_ignored.csv"
    )
    guest_path = "guest_rankings.csv"
    guest_ignore_path = "guest_ignored.csv"

    if logged_in:
        if not os.path.exists("user_data"):
            os.makedirs("user_data")

        if not os.path.exists(path) and os.path.exists(guest_path):
            try:
                os.rename(guest_path, path)
            except Exception:
                pass

        if (
            not os.path.exists(ignore_path)
            and os.path.exists(guest_ignore_path)
        ):
            try:
                os.rename(
                    guest_ignore_path,
                    ignore_path,
                )
            except Exception:
                pass

        if os.path.exists(guest_path):
            os.remove(guest_path)

        if os.path.exists(guest_ignore_path):
            os.remove(guest_ignore_path)

    if os.path.exists(path):
        try:
            df = pd.read_csv(path)
            df_personal = (
                df.rename(
                    columns={"My_Score": "Internal_Score"}
                )
                if "My_Score" in df.columns
                else df
            )
        except Exception:
            df_personal = pd.DataFrame(
                columns=["Name", "Rank", "Internal_Score"]
            )
    else:
        df_personal = pd.DataFrame(
            columns=["Name", "Rank", "Internal_Score"]
        )

    if "ignored_list" not in st.session_state:
        if os.path.exists(ignore_path):
            try:
                st.session_state.ignored_list = (
                    pd.read_csv(ignore_path)["Name"]
                    .tolist()
                )
            except Exception:
                st.session_state.ignored_list = []
        else:
            st.session_state.ignored_list = []

    return df_personal


def save_ignored_list():
    path, _, _ = get_user_context()
    ignore_path = (
        path.replace("rank__", "ignore__")
        if "user_data/" in path
        else "guest_ignored.csv"
    )
    pd.DataFrame(
        {"Name": st.session_state.ignored_list}
    ).to_csv(ignore_path, index=False)


def update_and_save(df):
    path, _, _ = get_user_context()
    df_lib = st.session_state.master_library

    df = df.sort_values("Rank").reset_index(drop=True)
    df["Rank"] = df.index + 1

    current_names = df["Name"].tolist()
    lib_subset = df_lib[
        df_lib["Name"].isin(current_names)
    ].copy()

    available_scores = sorted(
        pd.to_numeric(
            lib_subset["Rating_Num"],
            errors="coerce",
        )
        .fillna(0)
        .tolist(),
        reverse=True,
    )

    while len(available_scores) < len(df):
        available_scores.append(0.0)

    df["Internal_Score"] = available_scores[: len(df)]

    if "/" in path and not os.path.exists("user_data"):
        os.makedirs("user_data", exist_ok=True)

    df[["Name", "Rank", "Internal_Score"]].to_csv(
        path,
        index=False,
    )
    return df


def hard_reset_app_state():
    keys_to_preserve = {
        "ignored_list",
    }

    preserved = {
        k: v
        for k, v in st.session_state.items()
        if k in keys_to_preserve
    }

    st.session_state.clear()

    for k, v in preserved.items():
        st.session_state[k] = v

# --- 5. APP STARTUP ---

initialize_app()

df_lib = st.session_state.master_library
df_personal = load_user_data()
path, user_name, logged_in = get_user_context()


# --- AUTH TRANSITION NORMALIZATION ---

prev_auth = st.session_state.get("_prev_logged_in")

if prev_auth is None:
    st.session_state._prev_logged_in = logged_in

elif prev_auth != logged_in:
    st.session_state._prev_logged_in = logged_in
    hard_reset_app_state()
    st.rerun()


# --- 6. SIDEBAR ---

with st.sidebar:
    st.header("Settings")

    if not logged_in:
        if st.button(
            "🔑 Login with Google",
            use_container_width=True,
        ):
            st.session_state._login_initiated = True
            st.login()

    else:
        st.write(f"Account: **{user_name}**")
        if st.button(
            "Logout",
            use_container_width=True,
        ):
            st.logout()
            st.rerun()

    st.divider()

    all_currencies = sorted(
        [c.alpha_3 for c in pycountry.currencies]
    )

    default_curr_idx = (
        all_currencies.index("USD")
        if "USD" in all_currencies
        else 0
    )

    curr = st.selectbox(
        "Currency:",
        options=all_currencies,
        index=default_curr_idx,
    )

    @st.cache_data(ttl=86400)
    def get_rates():
        try:
            return (
                requests.get(
                    "https://open.er-api.com/v6/latest/USD"
                )
                .json()
                .get("rates", {"USD": 1.0})
            )
        except Exception:
            return {"USD": 1.0}

    rate = get_rates().get(curr, 1.0)

    if st.session_state.get("ignored_list"):
        st.divider()
        with st.expander(
            f"Ignored Whiskeys ({len(st.session_state.ignored_list)})"
        ):
            st.write(
                "Click ↺ to restore a bottle to your recommendations."
            )

            for item in st.session_state.ignored_list:
                cols = st.columns([4, 1])

                if cols[0].button(
                    item,
                    key=f"ignored_name_{item}",
                ):
                    st.session_state.selected_whisky = item
                    st.session_state.view_mode = "detail"
                    st.rerun()

                if cols[1].button(
                    "↺",
                    key=f"restore_{item}",
                ):
                    st.session_state.ignored_list.remove(item)
                    save_ignored_list()
                    st.rerun()

        if st.button(
            "Clear All Ignored",
            type="secondary",
            use_container_width=True,
        ):
            st.session_state.ignored_list = []
            save_ignored_list()
            st.rerun()


def handle_guest_limit_or_start_duel(
    selected_whiskey: str,
    df_personal: pd.DataFrame,
    logged_in: bool,
    exit_detail_view: bool = False,
):
    """
    Central gatekeeper for starting a duel.
    Correct auth-safe version.
    """

    if not logged_in and len(df_personal) >= 10:
        st.error("Guest limit reached.")
        st.markdown("### Sign in to continue")

        if st.button("Login / Sign up"):
            st.session_state._login_initiated = True
            st.login()

        return

    if exit_detail_view:
        st.session_state.view_mode = "main"
        st.session_state.selected_whisky = None

    st.session_state.update(
        {
            "in_duel": True,
            "new_whiskey": selected_whiskey,
            "low": 0,
            "high": len(df_personal) - 1,
        }
    )

    st.rerun()


# --- 7. VIEW MODE & REVIEWS ARCHIVE ---

if "view_mode" not in st.session_state:
    st.session_state.view_mode = "main"


df_reviews_archive = pd.DataFrame(
    columns=[
        "Whisky_Name",
        "Reviewer_Username",
        "Review_Link",
        "Reviewer_Rating",
        "Region_Style",
        "Price_Paid",
        "Review_Date",
        "Whisky_Name_norm",
        "Reviewer_Rating_Num",
    ]
)


def open_whisky_detail(name: str):
    st.session_state.selected_whisky = name
    st.session_state.view_mode = "detail"
    st.rerun()


def show_whisky_detail_page(
    name: str,
    df_lib: pd.DataFrame,
    df_reviews: pd.DataFrame,
):
    st.session_state.selected_whisky = name

    cols = st.columns([1, 2])

    with cols[0]:
        img_bytes = fetch_cached_image_bytes(name)
        if img_bytes:
            st.image(io.BytesIO(img_bytes), width=220)
        else:
            st.image(get_whiskey_image(name), width=220)

        if st.button(
            "Tried",
            use_container_width=True,
        ):
            handle_guest_limit_or_start_duel(
                name,
                df_personal,
                logged_in,
                exit_detail_view=True,
            )

    with cols[1]:
        st.markdown(f"### {name}")

        row = df_lib[df_lib["Name"] == name].head(1)

        if not row.empty:
            distillery = (
                row["Distillery"].iloc[0]
                if "Distillery" in row.columns
                else ""
            )
            rating = (
                row["Rating_Num"].iloc[0]
                if "Rating_Num" in row.columns
                else None
            )

            if distillery:
                st.write(f"Distillery: {distillery}")

            if rating is not None:
                st.write(f"Library rating: {rating:.2f}")

    st.divider()
    st.subheader("Community tasting notes")
    st.write("No community notes available yet.")


# --- 8. MAIN VIEW ROUTING ---

if (
    st.session_state.get("view_mode") == "detail"
    and st.session_state.get("selected_whisky")
):
    if st.button("← Back to list", type="secondary"):
        st.session_state.view_mode = "main"
        st.rerun()

    show_whisky_detail_page(
        st.session_state.selected_whisky,
        df_lib,
        df_reviews_archive,
    )

else:
    # --- MAIN INTERFACE (NON-DUEL STATE) ---

    if "in_duel" not in st.session_state:
        st.title("🥃 DramTrack Pro")

        whisky_options = sorted(
            df_lib["Name"].astype(str).tolist(),
            key=lambda x: x.lower(),
        )

        selected = st.selectbox(
            "Add & Rank a Bottle:",
            options=whisky_options,
            index=None,
            placeholder="Choose an option",
        )

        if selected:
            if selected in df_personal["Name"].values:
                st.warning("Already in your list.")
            else:
                handle_guest_limit_or_start_duel(
                    selected,
                    df_personal,
                    logged_in,
                )

        if not df_personal.empty:
            st.divider()

            display_df = pd.merge(
                df_personal,
                df_lib[
                    ["Name", "Distillery", "Price", "Value"]
                ],
                on="Name",
                how="left",
            )

            display_df["Price_Num"] = (
                pd.to_numeric(
                    display_df["Price"]
                    .astype(str)
                    .str.replace(
                        r"[^\d.]", "", regex=True
                    ),
                    errors="coerce",
                )
                .fillna(0.0)
            )

            display_df["Local_Price"] = (
                display_df["Price_Num"] * rate
            ).round(2)

            display_df["Value"] = (
                pd.to_numeric(
                    display_df["Value"],
                    errors="coerce",
                )
                .fillna(0.0)
                .round(2)
            )

            display_df["Internal_Score"] = (
                pd.to_numeric(
                    display_df["Internal_Score"],
                    errors="coerce",
                )
                .fillna(0.0)
                .round(2)
            )

            display_df["Delete"] = False

            cols = [
                "Rank",
                "Name",
                "Distillery",
                "Internal_Score",
                "Local_Price",
                "Value",
                "Delete",
            ]

            symbol_map = {
                "USD": "$",
                "EUR": "€",
                "GBP": "£",
                "JPY": "¥",
                "CAD": "$",
                "AUD": "$",
                "INR": "₹",
            }

            symbol = symbol_map.get(curr, curr + " ")

            edited_df = st.data_editor(
                display_df[cols],
                use_container_width=True,
                hide_index=True,
                disabled=[
                    "Rank",
                    "Name",
                    "Distillery",
                    "Internal_Score",
                    "Local_Price",
                    "Value",
                ],
                column_config={
                    "Rank": st.column_config.NumberColumn(
                        "Rank",
                        format="%.0f",
                    ),
                    "Delete": st.column_config.CheckboxColumn(
                        "Delete",
                        default=False,
                    ),
                    "Internal_Score": st.column_config.NumberColumn(
                        "Internal Score",
                        format="%.2f",
                    ),
                    "Local_Price": st.column_config.NumberColumn(
                        f"Price ({curr})",
                        format=f"{symbol}%.2f",
                    ),
                    "Value": st.column_config.NumberColumn(
                        "Value",
                        format="%.2f",
                    ),
                },
            )

            selected_to_del = edited_df[
                edited_df["Delete"] == True
            ]

            if not selected_to_del.empty:
                if st.button(
                    f"Delete Selected ({len(selected_to_del)})",
                    type="primary",
                    use_container_width=True,
                ):
                    names_to_delete = (
                        selected_to_del["Name"].tolist()
                    )
                    df_personal = df_personal[
                        ~df_personal["Name"].isin(
                            names_to_delete
                        )
                    ]
                    update_and_save(df_personal)
                    st.rerun()

            # --- RECOMMENDATIONS ---

            try:
                recs = get_recommendations(df_lib, df_personal, n=5)

                if not recs.empty:
                    recs = recs.sort_values(
                        by=["Rating_Num", "Value_Num"],
                        ascending=[False, False],
                    )

                    st.divider()
                    st.subheader("Recommended for you")

                    cols_rec = st.columns(5)

                    for i, row in enumerate(recs.itertuples(index=False)):
                        with cols_rec[i]:
                            name = row.Name

                            # ---- SINGLE SOURCE OF TRUTH ----
                            vkey = image_version_key(name)
                            if vkey not in st.session_state:
                                st.session_state[vkey] = 0

                            image_key = f"{name}::{st.session_state[vkey]}"

                            # ---- READ (ALWAYS FROM SESSION STATE) ----
                            img_bytes = fetch_cached_image_bytes(image_key)
                            if img_bytes:
                                st.image(io.BytesIO(img_bytes), use_container_width=True)
                            else:
                                st.image(get_whiskey_image(image_key), use_container_width=True)

                            # ---- ADMIN REPLACE (WRITE) ----
                            if is_admin():
                                if st.button(
                                    "↻ Replace image",
                                    key=f"rec_img_replace_{i}",
                                ):
                                    st.session_state[vkey] += 1
                                    st.rerun()

                            # ---- CLICKABLE NAME ----
                            if st.button(
                                name,
                                key=f"rec_open_{i}",
                                use_container_width=True,
                            ):
                                open_whisky_detail(name)

                            rating_val = getattr(row, "Rating_Num", None)
                            rating_text = (
                                f"{rating_val:.2f}" if rating_val is not None else "N/A"
                            )

                            st.markdown(
                                f"<div style='height:28px;'>Rating: {rating_text}</div>",
                                unsafe_allow_html=True,
                            )

                            action_col, ignore_col = st.columns([3, 1])

                            with action_col:
                                if st.button(
                                    "Tried",
                                    key=f"rec_tried_{i}",
                                    use_container_width=True,
                                ):
                                    handle_guest_limit_or_start_duel(
                                        name,
                                        df_personal,
                                        logged_in,
                                    )

                            with ignore_col:
                                if st.button("✕", key=f"rec_ignore_{i}"):
                                    st.session_state.ignored_list.append(name)
                                    save_ignored_list()
                                    st.rerun()

            except Exception as e:
                st.error(f"Recommendation Error: {e}")



# --- DUEL ENGINE ---

if "in_duel" in st.session_state:
    new_whiskey = st.session_state["new_whiskey"]

    if len(df_personal) == 0:
        update_and_save(
            pd.DataFrame(
                [{"Name": new_whiskey, "Rank": 1}]
            )
        )
        del st.session_state["in_duel"]
        st.rerun()

    low = st.session_state["low"]
    high = st.session_state["high"]

    if low <= high:
        mid = (low + high) // 2
        compare_to = df_personal.iloc[mid]["Name"]

        st.markdown(
            "<h2 style='text-align:center;'>Duel: Choose your favourite!</h2>",
            unsafe_allow_html=True,
        )

        col_left, col_vs, col_right = st.columns([4, 1, 4])

        # ---- LEFT CARD ----
        with col_left:
            pad_l, card, pad_r = st.columns([1, 2, 1])
            with card:
                img_key = new_whiskey
                img_bytes = fetch_cached_image_bytes(img_key)
                if img_bytes:
                    st.image(io.BytesIO(img_bytes), use_container_width=True)
                else:
                    st.image(get_whiskey_image(img_key), use_container_width=True)

                if st.button(
                    new_whiskey,
                    key="duel_new_better",
                    use_container_width=True,
                ):
                    st.session_state["high"] = mid - 1
                    if st.session_state["low"] > st.session_state["high"]:
                        insert_rank = mid
                        df_personal = pd.concat(
                            [
                                df_personal.iloc[:insert_rank],
                                pd.DataFrame(
                                    [{"Name": new_whiskey, "Rank": insert_rank + 1}]
                                ),
                                df_personal.iloc[insert_rank:],
                            ],
                            ignore_index=True,
                        )
                        update_and_save(df_personal)
                        del st.session_state["in_duel"]
                    st.rerun()

        # ---- VS ----
        with col_vs:
            st.markdown(
                "<div style='text-align:center; font-size:36px; font-weight:700; margin-top:200px;'>VS</div>",
                unsafe_allow_html=True,
            )

        # ---- RIGHT CARD ----
        with col_right:
            pad_l, card, pad_r = st.columns([1, 2, 1])
            with card:
                img_key = compare_to
                img_bytes = fetch_cached_image_bytes(img_key)
                if img_bytes:
                    st.image(io.BytesIO(img_bytes), use_container_width=True)
                else:
                    st.image(get_whiskey_image(img_key), use_container_width=True)

                if st.button(
                    compare_to,
                    key="duel_old_better",
                    use_container_width=True,
                ):
                    st.session_state["low"] = mid + 1
                    if st.session_state["low"] > st.session_state["high"]:
                        insert_rank = mid + 1
                        df_personal = pd.concat(
                            [
                                df_personal.iloc[:insert_rank],
                                pd.DataFrame(
                                    [{"Name": new_whiskey, "Rank": insert_rank + 1}]
                                ),
                                df_personal.iloc[insert_rank:],
                            ],
                            ignore_index=True,
                        )
                        update_and_save(df_personal)
                        del st.session_state["in_duel"]
                    st.rerun()

    else:
        df_personal = pd.concat(
            [
                df_personal,
                pd.DataFrame(
                    [{"Name": new_whiskey, "Rank": len(df_personal) + 1}]
                ),
            ],
            ignore_index=True,
        )
        update_and_save(df_personal)
        del st.session_state["in_duel"]
        st.rerun()
