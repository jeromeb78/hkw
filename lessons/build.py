import json, os, importlib.util, sys
D = os.path.dirname(os.path.abspath(__file__))
P = os.environ.get('HKW_APP', os.path.join(D, '..', 'index.html'))
ORDER = {
 'seed': ['Money mindset and stewardship', 'Your money map: net worth and budget', 'Emergency fund first', 'Good debt vs. bad debt', 'Compound growth', 'Stocks, bonds, ETFs, and index funds', 'Fraud red flags', 'Choosing a broker or investing on your own', 'Your first buy: fractional shares and limit orders', 'What an IPO is'],
 'sower': ['Retirement accounts: 401(k), Roth, traditional IRA', 'Asset allocation and diversification', 'Dollar-cost averaging in downturns', "Bull and bear markets: reading the market's seasons", 'Fees that quietly eat returns', 'Taxes 101', 'Reading a stock quote', 'Financial statements 101', 'Finding filings: 10-K, 10-Q, S-1', 'The IPO playbook: lock-ups and first-day pops'],
 'steward': ['Position sizing and rebalancing', "Protecting what you've built: insurance, wills, and trusts", 'Working with professionals', 'Faith-based investing', 'Real estate and REITs', 'Valuation basics', 'The moat and the four Ms', 'Deep 10-K and S-1 reading', 'Competitive analysis: Anthropic, OpenAI, Google, Meta', 'Sector cycles and bubbles'],
 'kingdom': ['How the top 1% think', 'Tax strategies', 'Trusts: revocable vs. irrevocable', 'Business ownership and family holding companies', 'Private markets and pre-IPO shares', 'Concentrated positions after an IPO gain', 'Family governance', 'Your legacy plan: succession and passing on wisdom', 'Strategic giving', 'Becoming a kingdom wealth distributor'],
}
lessons, extra = {}, {}
for t in ['seed', 'sower', 'steward', 'kingdom']:
    f = os.path.join(D, t + '.py')
    if not os.path.exists(f): continue
    spec = importlib.util.spec_from_file_location(t, f); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    lessons.update(m.L); extra.update(getattr(m, 'EXTRA', {}))
for k, v in lessons.items():
    q = v.get('quiz', [])
    assert len(q) == 10, (k, len(q))
    for x in q: assert 0 <= x['a'] < len(x['o']), k
    for f in ['intro','connect','sections','pros','cons','watch','tip','fit','example','terms','verse','check']: assert f in v, (k, f)
    assert set(v['fit']) == {'starter','mom','rebuilder','ent','exec','late','retiree','legacy'}, k
js = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')
# Module titles are public (landing page, Learn tab). Lesson text sits between the HKW-CONTENT
# markers: server.js strips it from the live page and serves each lesson only to signed-in members.
out = ['/*HKW-LESSONS-START*/']
for i, (t, mods) in enumerate(ORDER.items()):
    out.append(f"TIERS[{i}].modules={js(mods)};")
out += ['/*HKW-CONTENT-START*/', '(function(){',
 "const ipo=LESSONS['seed-5'], ira=LESSONS['sower-1'];",
 "if(ipo&&ipo.deep)LESSONS['seed-9']=ipo;",
 "if(ira&&ira.deep)LESSONS['sower-0']=ira;",
 "delete LESSONS['sower-1'];"]
out.append(f"Object.assign(LESSONS,{js(lessons)});")
for k, v in extra.items():
    out.append(f"if(LESSONS[{js(k)}]&&LESSONS[{js(k)}].quiz.length<10)LESSONS[{js(k)}].quiz.push(...{js(v)});")
TIPS={'seed-0':"Set up your giving, saving, and investing as automatic transfers on payday. When your money moves before you see it, faithfulness becomes a habit instead of a daily decision.",
 'seed-9':"When a famous company goes public, scammers often send texts offering \"early access\" to IPO shares. Real IPO allocations never come through a text or social media message.",
 'sower-0':"Check your workplace plan's vesting schedule before you change jobs. Leaving a few months early can cost you some or all of your employer's matching contributions."}
for k,v in TIPS.items(): out.append(f"if(LESSONS[{js(k)}]&&!LESSONS[{js(k)}].tip)LESSONS[{js(k)}].tip={js(v)};")
out.append('})();')
out.append('/*HKW-CONTENT-END*/')
out.append('/*HKW-LESSONS-END*/')
block = '\n'.join(out) + '\n'
s = open(P).read()
if '/*HKW-LESSONS-START*/' in s:
    a = s.index('/*HKW-LESSONS-START*/'); b = s.index('/*HKW-LESSONS-END*/') + len('/*HKW-LESSONS-END*/\n')
    s = s[:a] + block + s[b:]
else:
    a = s.index('const LEG=['); s = s[:a] + block + s[a:]
open(P, 'w').write(s)
print('lessons', len(lessons), sorted(lessons))
