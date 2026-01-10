#!/bin/bash

# デバッグAPIエンドポイントを呼び出すスクリプト
# 使用方法: ./debug_check_campaigns.sh "ハイブリッドマーケティング"

CAMPAIGN_NAME="${1:-ハイブリッドマーケティング}"
BASE_URL="http://localhost:8000"

echo "=========================================="
echo "キャンペーン: $CAMPAIGN_NAME のデバッグ情報を取得"
echo "=========================================="
echo ""

echo "1. リーチ数の比較データを取得..."
echo "URL: ${BASE_URL}/campaigns/debug/reach-comparison?campaign_name=${CAMPAIGN_NAME}"
echo ""

# 注意: 認証が必要なため、実際にはブラウザのコンソールから呼び出すか、
# セッションCookieを使用する必要があります
echo "⚠️  このスクリプトは認証が必要です。"
echo "   ブラウザのコンソールから以下のコマンドを実行してください:"
echo ""
echo "   await Api.getReachComparison('${CAMPAIGN_NAME}')"
echo "   await Api.getDuplicateCheck('${CAMPAIGN_NAME}')"
echo ""


