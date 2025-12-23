from typing import Optional

# プラン別の最大広告セット取得件数
PLAN_LIMITS = {
    "FREE": 100,
    "STANDARD": 100,
    "PRO": None  # None = 無制限
}

def get_max_adset_limit(plan: str) -> Optional[int]:
    """
    プランに応じた最大広告セット取得件数を返す
    
    Args:
        plan: ユーザーのプラン（FREE, STANDARD, PRO）
    
    Returns:
        最大取得件数（Noneの場合は無制限）
    """
    return PLAN_LIMITS.get(plan.upper(), 100)  # デフォルトは100件

