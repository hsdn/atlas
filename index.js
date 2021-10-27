const UI = require("../ui");
const bodyParser = require("../ui/node_modules/body-parser");
const globalShortcut = global.TeraProxy.GUIMode ? require("electron").globalShortcut : null;

module.exports = function Atlas(mod) {
	const ui = UI(mod);
	const citiesConfig = require("./cities");
	const citiesNames = new Map();
	let player = null;

	mod.game.initialize("inventory");
	mod.game.on("enter_character_lobby", async () => applyCitiesNames());

	mod.command.add("atlas", {
		"hotkey": arg => {
			if (!arg) {
				mod.command.message(`Current hotkey: ${mod.settings.hotkey}`);
			} else {
				if (arg.toLowerCase() !== mod.settings.hotkey.toLowerCase()) {
					const hotkey = arg.toLowerCase().split("+").map(w => w[0].toUpperCase() + w.substr(1)).join("+");

					try {
						globalShortcut.register(hotkey, () => ui.open());
						globalShortcut.unregister(mod.settings.hotkey);

						mod.settings.hotkey = hotkey;
					} catch (e) {
						return mod.command.message(`Invalid hotkey: ${hotkey}`);
					}
				}

				mod.command.message(`New hotkey: ${mod.settings.hotkey}`);
			}
		},
		"$none": () => ui.open()
	});

	mod.hook("S_SPAWN_ME", 3, event => { player = event; });
	mod.hook("C_PLAYER_LOCATION", 5, event => { player = event; });

	ui.use((request, response, next) => {
		response.header("Access-Control-Allow-Origin", "*");
		response.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
		next();
	});

	ui.use(bodyParser.json({ "limit": "50mb" }));
	ui.use(bodyParser.urlencoded({ "extended": true }));
	ui.use(UI.static(`${__dirname}/ui`));

	ui.post("/getTitle", (request, response) => {
		applyCitiesNames();
		response.json({ "title": `${citiesNames.get(1) || "World"} [${mod.settings.hotkey.replaceAll("+", " + ")}]` });
	});

	ui.post("/getCities", (request, response) => {
		const cities = [];

		citiesConfig.forEach(city => {
			const entry = { "name": "", "available": 0, ...city };
			const items = mod.game.inventory.findAll(city.itemId);

			if (items.length !== 0) {
				entry.available = items[0].amount;
			}

			if (citiesNames.has(city.id)) {
				entry.name = citiesNames.get(city.id);
				cities.push(entry);
			}
		});

		response.json({ cities });
	});

	ui.post("/useItem", (request, response) => {
		if (!player || !request.body || !request.body.itemId) return;

		mod.send("C_USE_ITEM", 3, {
			"gameId": mod.game.me.gameId,
			"id": request.body.itemId,
			"amount": 1,
			"loc": player.loc,
			"w": player.w,
			"unk4": true
		});

		response.json({});
	});

	async function applyCitiesNames() {
		if (citiesNames.size !== 0) return;

		const citiesIds = [];
		citiesConfig.forEach(city => citiesIds.push(city.id));

		(await mod.queryData("/StrSheet_Region/String@id=?", [[1, ...citiesIds]], true))
			.forEach(res => citiesNames.set(res.attributes.id, res.attributes.string));
	}

	globalShortcut.register(mod.settings.hotkey, () => ui.open());

	this.destructor = () => {
		globalShortcut.unregister(mod.settings.hotkey);
		mod.command.remove("atlas");
	};
};