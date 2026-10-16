"""打包独立模块与只读源快照；不运行原游戏构建。"""
from pathlib import Path
import hashlib
import json
import zipfile

HERE = Path(__file__).resolve().parent
GAME = HERE.parents[2]
PROJECT = GAME.parent


def main():
    names = [
        'README.md', 'index.js', 'tables.js', 'build.cjs', 'server.cjs',
        'balance.js', 'test.cjs', 'test-http.cjs', 'test-balance.cjs', 'viewer.template.html', 'package.py',
        'traits.json', 'traits-data.js', 'audit.json', '编目与查重报告.md',
        '魂性谱.html', 'verification.json', 'verification-http.json', 'visual-review.json',
        'balance-verification.json', '分档数值与自动结算说明.md',
    ]
    files = {HERE / name: '魂性谱/骰子系统/systems/traits/' + name for name in names}
    files.update({
        GAME / '武魂十档候选库.json': '魂性谱/武魂十档候选库.json',
        HERE.parent / 'dice/engine.js': '魂性谱/骰子系统/systems/dice/engine.js',
        HERE.parent / 'battle/examiners.js': '魂性谱/骰子系统/systems/battle/examiners.js',
        HERE.parent / 'challenge/battle.js': '魂性谱/骰子系统/systems/challenge/battle.js',
    })
    for source in files:
        if not source.is_file():
            raise FileNotFoundError(source)
    records = [{'path': name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
               for source, name in files.items()]
    manifest = {'name': '魂性谱', 'version': 2, 'files': records,
                'note': '只读源快照仅用于特性重建，不是完整游戏源码包。浏览器视觉验收未完成。'}
    target = PROJECT / '魂性谱_独立特性系统_v2.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source, name in files.items():
            archive.write(source, name)
        archive.writestr('魂性谱/package-manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        for record in records:
            assert hashlib.sha256(archive.read(record['path'])).hexdigest() == record['sha256']
    info = {'archive': str(target), 'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'bytes': target.stat().st_size, 'files': len(files) + 1,
            'verified': 'ZIP CRC与逐文件SHA256一致'}
    (HERE / 'package-verification.json').write_text(json.dumps(info, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(info, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
