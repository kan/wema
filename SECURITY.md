# セキュリティポリシー

## 脆弱性の報告

wema に脆弱性を見つけたら、公開の Issue には書かず、GitHub の [Private vulnerability reporting](https://github.com/kan/wema/security/advisories/new) から報告してください。報告の内容は、修正を公開するまでメンテナーにだけ見えます。

報告には次の内容を書いてください。

- 脆弱性の内容
- 再現の手順
- 想定される影響（読み書きできるデータ、必要な権限など）

受け取った報告は、できるだけ早く確認して返信します。

## 対象

対象は、このリポジトリのコードと、そこから配っているもの（npm の `@kanf/wema`、[Releases](https://github.com/kan/wema/releases) のスタンドアロン版 `wema.html`、[デモページ](https://kan.github.io/wema/)）です。修正は最新の版に対してだけ出します。古い版への修正の適用は行いません。

次のものは、それぞれの報告先へお願いします。

- wema を使った Wiki の wema-kake の問題: [kan/wema-kake](https://github.com/kan/wema-kake/security/policy)
- 依存しているパッケージの脆弱性: そのパッケージの報告先
