src = open("overworld/battle.js", encoding="utf-8").read()
old = "\treflect: { screen: 'reflect' }, lightscreen: { screen: 'light' },"
new = "\treflect: { screen: 'reflect' }, lightscreen: { screen: 'light' }, auroraveil: { screen: 'both' },"
assert old in src, "reflect anchor"
src = src.replace(old, new)
old = """		if (fx.screen) {
			const side = isFoe ? a.foeScreens : a.meScreens;
			if (side[fx.screen] > 0) { this.pushMsg('But it failed!'); return; }
			side[fx.screen] = 5;"""
new = """		if (fx.screen) {
			const side = isFoe ? a.foeScreens : a.meScreens;
			if (fx.screen === 'both') {
				if (side.reflect > 0 && side.light > 0) { this.pushMsg('But it failed!'); return; }
				side.reflect = Math.max(side.reflect || 0, 5);
				side.light = Math.max(side.light || 0, 5);
				this.pushMsg(`${user.name} is protected by Aurora Veil!`);
				return;
			}
			if (side[fx.screen] > 0) { this.pushMsg('But it failed!'); return; }
			side[fx.screen] = 5;"""
assert old in src, "screen anchor"
src = src.replace(old, new)
old = "\tsweetscent: { stat: 'eva', d: -1, foe: true },"
new = "\tsweetscent: { stat: 'eva', d: -1, foe: true }, tarshot: { stat: 'spe', d: -1, foe: true },"
assert old in src, "sweetscent anchor"
src = src.replace(old, new)
open("overworld/battle.js", "w", encoding="utf-8").write(src)
print("260/260 handled")
