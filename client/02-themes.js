    const THEMES = [
      ["almond", "Almond blossom - Van Gogh", "#D4EEEA", "#F6FBFA", "#1C7874"],
      ["light", "Light", "#F4F6FB", "#FFFFFF", "#3D3BF3"],
      ["grey", "Grey", "#CFD0D3", "#E3E4E6", "#3D3BF3"],
      ["mint", "Mint", "#E1F2EA", "#F5FBF8", "#0B7A5B"],
      ["lavender", "Lavender", "#E9E4F8", "#F7F5FD", "#6B3FD8"],
      ["sand", "Sand", "#EDE3D3", "#FAF5EC", "#B5531B"],
      ["dusk", "Dusk", "#C5D2EE", "#DFE8F8", "#2F3DDB"],
      ["graphite", "Graphite", "#161618", "#222226", "#4F7DF0"],
      ["ocean", "Ocean", "#08202B", "#0F3040", "#0E8FA3"],
      ["plum", "Plum", "#1B1026", "#281A38", "#A24FE8"],
      ["forest", "Forest", "#0E1F17", "#162E22", "#1F9E5C"],
      ["dark", "Dark", "#0D1020", "#171B33", "#7C7BFF"],
      ["rose", "Rose", "#F8E4EA", "#FFF6F8", "#B4235A"],
      ["sky", "Sky", "#E3F1FB", "#F5FBFF", "#0B649C"],
      ["peach", "Peach", "#F8E6D4", "#FFF6EE", "#A3410E"],
      ["lemon", "Lemon", "#F7F0C8", "#FFFBEA", "#7A5A00"],
      ["lilac", "Lilac", "#F3E6F6", "#FBF6FD", "#7A2490"],
      ["sage", "Sage", "#E4EDE4", "#F4F8F4", "#246B38"],
      ["cream", "Cream", "#F6F1E6", "#FFFCF6", "#7A4E22"],
      ["blush", "Blush", "#FDE8E4", "#FFF7F5", "#C13A28"],
      ["ice", "Ice", "#E7F4F4", "#F6FCFC", "#0C6E6C"],
      ["clay", "Clay", "#F3E4D8", "#FBF4EE", "#8C4520"],
      ["wine", "Wine", "#2A1018", "#3A1824", "#E25A86"],
      ["cocoa", "Cocoa", "#241810", "#342418", "#E08A45"],
      ["moss", "Moss", "#1A2214", "#26301C", "#8FBF4A"],
      ["slate", "Slate", "#1A222C", "#24303C", "#5BA4E0"],
      ["ember", "Ember", "#2A140C", "#3A1E12", "#FF8A3D"],
      ["lagoon", "Lagoon", "#0C2428", "#143438", "#3DCFC4"],
      ["cherry", "Cherry", "#2A0E14", "#3C1620", "#FF5A7A"],
      ["indigo", "Indigo", "#12142E", "#1C2044", "#8B8CFF"],
      ["berry", "Berry", "#241028", "#341838", "#E07BFF"],
      ["fog", "Fog", "#1C1E22", "#2A2E34", "#7AA2FF"],
      ["apricot", "Apricot", "#FDE3D0", "#FFF6EE", "#C44E18"],
      ["honey", "Honey", "#F8EEC0", "#FFF9E6", "#A07800"],
      ["powder", "Powder", "#E4EEF8", "#F7FBFF", "#2A6CB0"],
      ["pearl", "Pearl", "#F2F0EC", "#FBFBF9", "#4E6274"],
      ["pistachio", "Pistachio", "#E6F2D8", "#F6FBF0", "#4A8A28"],
      ["flamingo", "Flamingo", "#FDE0EA", "#FFF5F8", "#C42868"],
      ["butter", "Butter", "#FFF6C8", "#FFFCEE", "#8A7800"],
      ["cloud", "Cloud", "#E8EEF2", "#F7FAFC", "#3A6A88"],
      ["linen", "Linen", "#F4EFE6", "#FBF8F3", "#8A6840"],
      ["aqua", "Aqua", "#DFF4F2", "#F4FCFB", "#0E7A74"],
      ["mauve", "Mauve", "#F0E4EE", "#FBF6FA", "#8A3A78"],
      ["dune", "Dune", "#EFE4D2", "#F8F3E8", "#A06A30"],
      ["matcha", "Matcha", "#E2EEDC", "#F4F8F0", "#3A7A32"],
      ["blossom", "Blossom", "#F8E0E8", "#FFF4F7", "#C43A6A"],
      ["frost", "Frost", "#E6F2F8", "#F5FBFE", "#1A6A90"],
      ["midnight", "Midnight", "#0C1024", "#161B36", "#6C8CFF"],
      ["ruby", "Ruby", "#2A1014", "#3C181E", "#FF4D6A"],
      ["pine", "Pine", "#0E1C16", "#163026", "#3DDC7A"],
      ["storm", "Storm", "#1A1E28", "#262C3A", "#7AA0FF"],
      ["copper", "Copper", "#2A1810", "#3C2418", "#FF9A4A"],
      ["orchid", "Orchid", "#221428", "#321C3C", "#D070F0"],
      ["abyss", "Abyss", "#07141C", "#0E2430", "#2EC8E0"],
      ["espresso", "Espresso", "#1C1410", "#2C2018", "#E0A060"],
      ["glow", "Glow", "#101820", "#182830", "#5EE0C0"],
      ["fjord", "Fjord", "#101820", "#182838", "#4AA8E0"],
      ["violet", "Violet", "#181228", "#261C3C", "#A078FF"],
      ["ash", "Ash", "#222426", "#303436", "#7EB0FF"],
      ["sunset", "Sunset", "#2A1218", "#3C1C24", "#FF7A4A"],
      ["jade", "Jade", "#0C1C18", "#143028", "#2ED6A0"],
      ["ink", "Ink", "#101014", "#1C1C24", "#9AA0FF"],
      ["tokyo", "Tokyo", "#140818", "#26102C", "#FF2E97"],
      ["oasis", "Oasis", "#06241C", "#0E3A2C", "#F0C14A"],
      ["peacock", "Peacock", "#041820", "#0C3040", "#14F1C8"],
      ["volcano", "Volcano", "#1A0A08", "#2E1210", "#FF3D00"],
      ["coral", "Coral", "#FDE6DC", "#FFF7F3", "#D24528"],
      ["tangerine", "Tangerine", "#FFE6C4", "#FFF8EE", "#D85A00"],
      ["mango", "Mango", "#FFE9B4", "#FFF9E6", "#C26E00"],
      ["kiwi", "Kiwi", "#E6F6C8", "#F7FCEC", "#4E8C12"],
      ["olive", "Olive", "#E6E4C4", "#F6F5EA", "#5E6010"],
      ["seafoam", "Seafoam", "#D6F6EC", "#F2FCF8", "#0C8870"],
      ["tide", "Tide", "#D2F0F2", "#F0FBFC", "#087888"],
      ["denim", "Denim", "#DCE4F6", "#F4F7FD", "#1A4E9C"],
      ["periwinkle", "Periwinkle", "#E2E4FA", "#F5F6FD", "#4548C4"],
      ["wisteria", "Wisteria", "#EBE2F8", "#F7F4FD", "#7440C0"],
      ["heather", "Heather", "#EDE2EA", "#F8F3F6", "#864878"],
      ["mulberry", "Mulberry", "#F6DEEA", "#FCF3F7", "#A02470"],
      ["strawberry", "Strawberry", "#FDE0E6", "#FFF4F6", "#D01848"],
      ["terracotta", "Terracotta", "#F6DCC6", "#FBF3EA", "#B45420"],
      ["saffron", "Saffron", "#FFE6A4", "#FFF6D8", "#C07000"],
      ["basil", "Basil", "#D8EED0", "#F2F9EE", "#247830"],
      ["fern", "Fern", "#D4E6D0", "#F0F6EC", "#2A6824"],
      ["eucalyptus", "Eucalyptus", "#D4EEE2", "#F1FAF5", "#147856"],
      ["glacier", "Glacier", "#D8EEF8", "#F2FAFD", "#086890"],
      ["parchment", "Parchment", "#F4EAD6", "#FBF6EC", "#8A6028"],
      ["wheat", "Wheat", "#F6E8C4", "#FBF6E6", "#A07420"],
      ["cinnamon", "Cinnamon", "#F6D8C0", "#FBF3E8", "#A04818"],
      ["bubblegum", "Bubblegum", "#F8D6EC", "#FFF3FA", "#D02088"],
      ["iris", "Iris", "#E4DEF8", "#F5F3FD", "#5438B4"],
      ["navy", "Navy", "#081428", "#102040", "#4A90FF"],
      ["sapphire", "Sapphire", "#0A1830", "#122848", "#3A78FF"],
      ["nebula", "Nebula", "#120820", "#221030", "#C058FF"],
      ["aurora", "Aurora", "#081820", "#102C28", "#3EE8A8"],
      ["matrix", "Matrix", "#081208", "#102010", "#3CFF62"],
      ["emerald", "Emerald", "#071610", "#0E281C", "#22E090"],
      ["onyx", "Onyx", "#0C0C10", "#18181E", "#C8CCD8"],
      ["garnet", "Garnet", "#260810", "#3A1018", "#FF4468"],
      ["crimson", "Crimson", "#22080C", "#360E14", "#FF3858"],
      ["amethyst", "Amethyst", "#160818", "#261028", "#C868F0"],
      ["citrine", "Citrine", "#1C1608", "#2C240C", "#F0C040"],
      ["canyon", "Canyon", "#221008", "#36180C", "#FF7840"],
      ["arctic", "Arctic", "#0A141C", "#12202C", "#8AD0F0"],
      ["caribbean", "Caribbean", "#062018", "#0C3028", "#22E0A8"],
      ["sakura", "Sakura", "#1E0814", "#321020", "#FF78A8"],
      ["eclipse", "Eclipse", "#0C0C12", "#181820", "#E8C848"],
      ["papaya", "Papaya", "#FFE0C4", "#FFF4EA", "#E06018"],
      ["lime", "Lime", "#E8F6C0", "#F7FCE8", "#568C08"],
      ["wasabi", "Wasabi", "#E6F0BC", "#F6FAE6", "#6A8A08"],
      ["clover", "Clover", "#D4EED8", "#F2FAF4", "#1E8840"],
      ["snow", "Snow", "#F2F6F8", "#FFFFFF", "#2A5878"],
      ["oat", "Oat", "#F2EBE0", "#FBF7F2", "#8A6840"],
      ["tomato", "Tomato", "#FCD6CE", "#FFF3F0", "#D02414"],
      ["cranberry", "Cranberry", "#F6D0D8", "#FBF0F2", "#A01240"],
      ["raspberry", "Raspberry", "#F8D4E2", "#FFF1F6", "#C01458"],
      ["hyacinth", "Hyacinth", "#DCE2F8", "#F3F5FD", "#2844C0"],
      ["porcelain", "Porcelain", "#F0F3F6", "#FAFBFC", "#3A5874"],
      ["sunflower", "Sunflower", "#FFE8A0", "#FFF7DC", "#D09000"],
      ["turquoise", "Turquoise", "#D0F2EE", "#F0FBFA", "#0A8078"],
      ["opal", "Opal", "#E4F2F0", "#F6FBFA", "#3A7880"],
      ["vanilla", "Vanilla", "#F8F2E0", "#FFFCF4", "#A08040"],
      ["caramel", "Caramel", "#F4DCC0", "#FBF4E8", "#A06020"],
      ["rust", "Rust", "#F6D4C4", "#FBF1E8", "#B03814"],
      ["khaki", "Khaki", "#E8E4C4", "#F6F4E6", "#6E6818"],
      ["obsidian", "Obsidian", "#0A0A10", "#16161E", "#8088FF"],
      ["galaxy", "Galaxy", "#0C0818", "#181028", "#A070FF"],
      ["borealis", "Borealis", "#081418", "#102028", "#40F0C0"],
      ["cyber", "Cyber", "#081018", "#102028", "#00E0C0"],
      ["magma", "Magma", "#200808", "#341010", "#FF5020"],
      ["burgundy", "Burgundy", "#240810", "#381018", "#E05070"],
      ["amber", "Amber", "#201408", "#321C08", "#FFB020"],
      ["sahara", "Sahara", "#1C1408", "#2C200C", "#E8B050"],
      ["amazon", "Amazon", "#0C180C", "#142414", "#50D060"],
      ["maldives", "Maldives", "#062018", "#0C302C", "#20E0C8"],
      ["kyoto", "Kyoto", "#1C1014", "#2C1820", "#E07080"],
      ["iceberg", "Iceberg", "#0C181C", "#142428", "#70D0E8"],
      ["melon", "Melon", "#F0F6D0", "#F8FCE8", "#6A8C10"],
      ["guava", "Guava", "#F8D4C8", "#FFF4EE", "#D04848"],
      ["fig", "Fig", "#E0D0DC", "#F7F0F5", "#7A3068"],
      ["grape", "Grape", "#E0D0F4", "#F6F0FA", "#6A28A8"],
      ["apple", "Apple", "#C8EEC0", "#F2FAEA", "#2A8A28"],
      ["bamboo", "Bamboo", "#E4ECC0", "#F6FAE4", "#708010"],
      ["meadow", "Meadow", "#C8E8D0", "#F0FAF2", "#188848"],
      ["chalk", "Chalk", "#F6F8F4", "#FFFFFF", "#4A6860"],
      ["marble", "Marble", "#E8ECF0", "#F8F9FA", "#4A6070"],
      ["mist", "Mist", "#E0E6E2", "#F4F8F6", "#4A6868"],
      ["champagne", "Champagne", "#F8E8C0", "#FFF9EA", "#A88830"],
      ["maple", "Maple", "#F0C898", "#FBF2E4", "#B06018"],
      ["toffee", "Toffee", "#E8C8A4", "#FBF3E6", "#8C5018"],
      ["latte", "Latte", "#F0E0D0", "#FBF6EE", "#8A6038"],
      ["brick", "Brick", "#F0C8BC", "#FBF0EA", "#A03020"],
      ["thistle", "Thistle", "#DCD4E4", "#F6F2F7", "#6A4878"],
      ["fuchsia", "Fuchsia", "#F4C0E4", "#FFF2FA", "#C01888"],
      ["persimmon", "Persimmon", "#FFD0A8", "#FFF4E8", "#D05010"],
      ["charcoal", "Charcoal", "#141618", "#202428", "#90A0B0"],
      ["raven", "Raven", "#0C1018", "#161C28", "#6A90C8"],
      ["cosmos", "Cosmos", "#100818", "#1C1028", "#8860E0"],
      ["neon", "Neon", "#101408", "#1C2410", "#C8FF40"],
      ["vapor", "Vapor", "#181028", "#281840", "#E060C0"],
      ["inferno", "Inferno", "#280C04", "#401408", "#FF6020"],
      ["scarlet", "Scarlet", "#280810", "#401014", "#FF4060"],
      ["merlot", "Merlot", "#1C0810", "#2C1018", "#C04060"],
      ["bronze", "Bronze", "#1C140C", "#2C2014", "#D09050"],
      ["jungle", "Jungle", "#081408", "#102010", "#30C040"],
      ["aegean", "Aegean", "#081420", "#102430", "#3080D0"],
      ["havana", "Havana", "#201410", "#322018", "#E09060"],
      ["nectarine", "Nectarine", "#FCD8C4", "#FFF4EC", "#E07030"],
      ["pumpkin", "Pumpkin", "#F8D090", "#FFF4DC", "#D07800"],
      ["watermelon", "Watermelon", "#F4D4D8", "#FFF2F4", "#C81840"],
      ["lychee", "Lychee", "#F8E0E4", "#FFF6F8", "#C05070"],
      ["coconut", "Coconut", "#F6F2E4", "#FFFCFA", "#8A7A58"],
      ["sherbet", "Sherbet", "#F8D8F0", "#FFF4FC", "#D040A0"],
      ["mustard", "Mustard", "#F0E090", "#FBF6D4", "#A88800"],
      ["chartreuse", "Chartreuse", "#E0F090", "#F4FCD4", "#78A000"],
      ["cactus", "Cactus", "#C8E0C0", "#F0F8EC", "#2A7040"],
      ["nutmeg", "Nutmeg", "#E8D0B0", "#F8F0E4", "#8A5820"],
      ["salmon", "Salmon", "#F8D0C4", "#FFF4F0", "#E06050"],
      ["quartz", "Quartz", "#E8E4F0", "#F6F4FA", "#6860A0"],
      ["azure", "Azure", "#C8E4F8", "#F0F8FF", "#0870C0"],
      ["teal", "Teal", "#C0E4E0", "#EEF8F6", "#0A7870"],
      ["ivory", "Ivory", "#FAF6EC", "#FFFCFA", "#7A6848"],
      ["sienna", "Sienna", "#E8C0A0", "#F8EDE4", "#A04820"],
      ["santorini", "Santorini", "#D4E8F4", "#F4FAFD", "#1A6A9C"],
      ["pewter", "Pewter", "#D4D8DC", "#F2F4F6", "#4A5868"],
      ["rio", "Rio", "#081820", "#102C38", "#20C8E0"],
      ["bali", "Bali", "#0C2018", "#143028", "#40C080"],
      ["seoul", "Seoul", "#180818", "#281028", "#FF4088"],
      ["marrakech", "Marrakech", "#201008", "#341808", "#E86830"],
      ["lisbon", "Lisbon", "#141810", "#222818", "#C8B060"],
      ["fuji", "Fuji", "#101820", "#1C2834", "#A0C8E0"],
      ["polar", "Polar", "#0C1418", "#142028", "#B0D8F0"],
      ["nordic", "Nordic", "#101418", "#1C242C", "#7090A8"],
      ["baltic", "Baltic", "#0A1820", "#142830", "#48A0C0"],
      ["tropic", "Tropic", "#041810", "#0C281C", "#18D090"],
      ["topaz", "Topaz", "#1C1408", "#2C200C", "#F0A030"],
      ["brass", "Brass", "#1C1808", "#2C260C", "#E0C060"]
    ];
    const THEME_NAMES = {};
    THEMES.forEach((row) => { THEME_NAMES[row[0]] = row[1]; });
    const THEME_KEY = "enquiz-theme";
    const CUSTOM_THEME_KEY = "enquiz-custom-themes";
    const THEME_PICTURE_KEY = "enquiz-theme-picture";
    const HIDDEN_LESSONS_KEY = "enquiz-hidden-lessons";
    const ALLOWED_LESSONS_KEY = "enquiz-allowed-lessons";
    const CUSTOM_COLOR_KEYS = ["--bg", "--card", "--ink", "--mute", "--line", "--acc", "--acc-s", "--ok", "--ok-s", "--bad", "--bad-s", "--on-acc", "--photo-wash"];
    function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
    function hexByte(n) { return clampNum(Math.round(n), 0, 255).toString(16).padStart(2, "0"); }
    function rgbHex(r, g, b) { return "#" + hexByte(r) + hexByte(g) + hexByte(b); }
    function hslRgb(h, s, l) {
      h = ((h % 360) + 360) % 360;
      s = clampNum(s, 0, 1);
      l = clampNum(l, 0, 1);
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const hp = h / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      let r = 0, g = 0, b = 0;
      if (hp < 1) { r = c; g = x; }
      else if (hp < 2) { r = x; g = c; }
      else if (hp < 3) { g = c; b = x; }
      else if (hp < 4) { g = x; b = c; }
      else if (hp < 5) { r = x; b = c; }
      else { r = c; b = x; }
      const m = l - c / 2;
      return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
    }
    function hexHsl(h, s, l) {
      const rgb = hslRgb(h, s, l);
      return rgbHex(rgb[0], rgb[1], rgb[2]);
    }
    function rgbHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0, s = 0;
      const d = max - min;
      if (d) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      return { h: h, s: s, l: l };
    }
    function channelLum(c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    function relLum(r, g, b) {
      return 0.2126 * channelLum(r) + 0.7152 * channelLum(g) + 0.0722 * channelLum(b);
    }
    function paletteFromPixels(pixels) {
      const buckets = new Map();
      pixels.forEach((p) => {
        const hsl = rgbHsl(p.r, p.g, p.b);
        const key = Math.round(hsl.h / 12) + "|" + (hsl.s < 0.12 ? 0 : Math.round(hsl.s * 5)) + "|" + Math.round(hsl.l * 8);
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { h: 0, s: 0, l: 0, n: 0 };
          buckets.set(key, bucket);
        }
        bucket.h += hsl.h;
        bucket.s += hsl.s;
        bucket.l += hsl.l;
        bucket.n += 1;
      });
      const clusters = Array.from(buckets.values()).map((bucket) => ({
        h: bucket.h / bucket.n,
        s: bucket.s / bucket.n,
        l: bucket.l / bucket.n,
        n: bucket.n
      })).sort((a, b) => b.n - a.n);
      if (!clusters.length) return null;
      const ground = clusters[0];
      let accent = null;
      let best = -1;
      clusters.forEach((cluster) => {
        if (cluster.n < pixels.length * 0.015) return;
        const distance = Math.min(Math.abs(cluster.h - ground.h), 360 - Math.abs(cluster.h - ground.h));
        const score = cluster.s * (0.35 + Math.min(distance, 80) / 80) * Math.sqrt(cluster.n);
        if (cluster.s > 0.16 && score > best) {
          best = score;
          accent = cluster;
        }
      });
      if (!accent) accent = clusters.find((cluster) => cluster.s > ground.s + 0.05) || ground;
      const dark = ground.l < 0.45;
      const groundSat = clampNum(ground.s, dark ? 0.12 : 0.08, dark ? 0.5 : 0.4);
      const accentSat = clampNum(Math.max(accent.s, 0.45), 0.45, 0.88);
      const accentLight = dark ? clampNum(Math.max(accent.l, 0.56), 0.56, 0.72) : clampNum(Math.min(accent.l, 0.38), 0.28, 0.42);
      const accentRgb = hslRgb(accent.h, accentSat, accentLight);
      const onAcc = relLum(accentRgb[0], accentRgb[1], accentRgb[2]) > 0.62 ? hexHsl(accent.h, 0.25, 0.12) : "#FFFFFF";
      const bg = hexHsl(ground.h, groundSat, dark ? 0.11 : 0.9);
      const vars = dark ? {
        "--bg": bg,
        "--card": hexHsl(ground.h, groundSat * 0.85, 0.17),
        "--ink": hexHsl(ground.h, 0.12, 0.94),
        "--mute": hexHsl(ground.h, 0.1, 0.72),
        "--line": hexHsl(ground.h, 0.16, 0.28),
        "--acc": rgbHex(accentRgb[0], accentRgb[1], accentRgb[2]),
        "--acc-s": hexHsl(accent.h, 0.32, 0.22),
        "--ok": "#7DDE6A",
        "--ok-s": "#14361C",
        "--bad": "#FF8A80",
        "--bad-s": "#402420",
        "--on-acc": onAcc,
        "--photo-wash": bg + "99",
        "color-scheme": "dark"
      } : {
        "--bg": bg,
        "--card": hexHsl(ground.h, groundSat * 0.45, 0.97),
        "--ink": hexHsl(ground.h, 0.25, 0.16),
        "--mute": hexHsl(ground.h, 0.14, 0.4),
        "--line": hexHsl(ground.h, 0.16, 0.78),
        "--acc": rgbHex(accentRgb[0], accentRgb[1], accentRgb[2]),
        "--acc-s": hexHsl(accent.h, 0.28, 0.88),
        "--ok": "#1F8A56",
        "--ok-s": "#D7F3E6",
        "--bad": "#C4373C",
        "--bad-s": "#F8D6D8",
        "--on-acc": "#FFFFFF",
        "--photo-wash": bg + "99",
        "color-scheme": "light"
      };
      return { bg: vars["--bg"], card: vars["--card"], acc: vars["--acc"], vars: vars };
    }
    function customThemeOk(row) {
      const hex = /^#[0-9A-Fa-f]{6}$/;
      const wash = /^#[0-9A-Fa-f]{8}$/;
      const photoRe = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
      if (!row || typeof row.id !== "string" || row.id.indexOf("user-") !== 0 || !row.vars) return false;
      for (let i = 0; i < CUSTOM_COLOR_KEYS.length; i++) {
        const key = CUSTOM_COLOR_KEYS[i];
        const val = row.vars[key];
        if (val == null || val === "") continue;
        if (typeof val !== "string") return false;
        if (key === "--photo-wash") {
          if (!wash.test(val) && !hex.test(val)) return false;
        } else if (!hex.test(val)) {
          return false;
        }
      }
      if (typeof row.vars["--bg"] !== "string" || !hex.test(row.vars["--bg"])) return false;
      if (typeof row.vars["--card"] !== "string" || !hex.test(row.vars["--card"])) return false;
      if (typeof row.vars["--acc"] !== "string" || !hex.test(row.vars["--acc"])) return false;
      if (row.photo != null && row.photo !== "") {
        const photoKey = /^stage-local\/themes\/[A-Za-z0-9_-]{1,100}\/user-[a-z0-9-]{1,80}\/[a-f0-9]{64}$/;
        if (typeof row.photo !== "string" || row.photo.length > 450000) return false;
        if (!photoRe.test(row.photo) && !photoKey.test(row.photo)) return false;
      }
      return true;
    }
    function loadCustomThemes() {
      try {
        const list = JSON.parse(localStorage.getItem(CUSTOM_THEME_KEY) || "[]");
        return Array.isArray(list) ? list.filter(customThemeOk) : [];
      } catch (e) { return []; }
    }
    function themesForServer(list) {
      return (list || []).map((row) => {
        const copy = Object.assign({}, row);
        const key = typeof row.photoKey === "string" && row.photoKey.indexOf("stage-local/themes/") === 0 ? row.photoKey : (typeof row.photo === "string" && row.photo.indexOf("stage-local/themes/") === 0 ? row.photo : "");
        copy.photo = key;
        delete copy.photoKey;
        return copy;
      });
    }
    const themeUploadFlights = new Map();
    function queueThemePhotos(list) {
      if (!window.LearningMain || typeof window.LearningMain.uploadThemePhoto !== "function") return;
      (list || []).forEach((row) => {
        if (!row || typeof row.photo !== "string" || row.photo.indexOf("data:image/") !== 0 || row.photoKey) return;
        const id = row.id, photo = row.photo, actor = authUser?.id;
        if (!actor || themeUploadFlights.has(id)) return;
        themeUploadFlights.set(id, photo);
        Promise.resolve(dataUrlBlob(row.photo)).then((blob) => window.LearningMain.uploadThemePhoto(id, blob)).then((result) => {
          if (authUser?.id !== actor || viewAccount) return;
          const current = loadCustomThemes();
          const item = current.find((theme) => theme && theme.id === id);
          if (!item || item.photo !== photo || !result || typeof result.photo !== "string") return;
          rememberThemePicture(id, themePhotoStamp(result.photo), photo);
          item.photo = result.photo;
          delete item.photoKey;
          saveCustomThemes(current);
        }).catch(() => {}).finally(() => themeUploadFlights.delete(id));
      });
    }
    function saveCustomThemes(list) {
      if (viewAccount) return;
      const next = list.slice(0, 16);
      try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next)); }
      catch (e) {
        try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next.map((row) => Object.assign({}, row, { photo: keptThemePhoto(row) })))); }
        catch (err) {}
      }
      const pendingPhotos = next.some((row) => typeof row.photo === "string" && row.photo.indexOf("data:image/") === 0 && !row.photoKey);
      if (!pendingPhotos && typeof syncChange === "function" && !viewAccount) syncChange({ op: "put-setting", key: "customThemes", value: themesForServer(next) });
      queueThemePhotos(next);
    }
    const DEFAULT_THEME = "almond";
    function themeCut() {
      const cut = THEMES.findIndex((row) => row[0] === "coral");
      return cut < 0 ? THEMES.length : cut;
    }
    function visibleThemes() {
      const pub = THEMES.slice(0, themeCut());
      return samePersonStudy() ? THEMES : pub;
    }
    function privateThemeId(name) {
      return THEMES.slice(themeCut()).some((row) => row[0] === name);
    }
    function twinStudyLogin(login) {
      if (login === "TsovakDev") return "Tsovak";
      if (login === "Tsovak") return "TsovakDev";
      return "";
    }
    function visibleCustomThemes() {
      if (hideStudentSongs()) return [];
      const login = viewAccount && viewAccount.login ? viewAccount.login : (authUser && authUser.login ? authUser.login : "");
      return loadCustomThemes().filter((row) => {
        const owner = row.owner ? String(row.owner) : "";
        if (!login) return !owner;
        return !owner || owner === login;
      });
    }
    function currentTheme() {
      try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === "auto") localStorage.setItem(THEME_KEY, DEFAULT_THEME);
        return saved && saved !== "auto" ? saved : DEFAULT_THEME;
      }
      catch (e) { return DEFAULT_THEME; }
    }
    function installCustomThemes(list) {
      const next = (Array.isArray(list) ? list : []).filter(customThemeOk).slice(0, 16);
      try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next)); }
      catch (e) {
        try { localStorage.setItem(CUSTOM_THEME_KEY, JSON.stringify(next.map((row) => Object.assign({}, row, { photo: keptThemePhoto(row) })))); }
        catch (err) {}
      }
    }
    function themeCanShow(name) {
      if (name && THEME_NAMES[name]) return !privateThemeId(name) || samePersonStudy();
      if (name && String(name).indexOf("user-") === 0) return visibleCustomThemes().some((row) => row.id === name);
      return false;
    }
    function settleThemeAudience() {
      paintThemeSegs();
      if (typeof syncExamPassInputs === "function") syncExamPassInputs();
    }
    function themeLabel(name) {
      const custom = loadCustomThemes().find((row) => row.id === name);
      if (custom) return custom.name || "Picture";
      return THEME_NAMES[name || DEFAULT_THEME] || THEME_NAMES[DEFAULT_THEME] || "Theme";
    }
    function clearCustomPaint(root, keepPhoto) {
      CUSTOM_COLOR_KEYS.forEach((key) => root.style.removeProperty(key));
      if (!keepPhoto) root.style.removeProperty("--theme-photo");
      root.style.removeProperty("color-scheme");
    }
    function keptThemePhoto(row) {
      const photo = row && typeof row.photo === "string" ? row.photo : "";
      return photo.indexOf("stage-local/themes/") === 0 ? photo : "";
    }
    function themePhotoStamp(photo) {
      return typeof photo === "string" && photo.indexOf("stage-local/themes/") === 0 ? photo.slice(photo.lastIndexOf("/") + 1) : "";
    }
    function rememberedThemePhoto(theme) {
      if (!theme) return "";
      try {
        const saved = JSON.parse(localStorage.getItem(THEME_PICTURE_KEY) || "null");
        if (!saved || saved.id !== theme.id || typeof saved.url !== "string" || saved.url.indexOf("data:image/") !== 0) return "";
        if (!theme.photo || saved.stamp !== themePhotoStamp(theme.photo)) return "";
        return saved.url;
      } catch (e) { return ""; }
    }
    function rememberThemePicture(id, stamp, dataUrl) {
      if (!id || typeof dataUrl !== "string" || dataUrl.indexOf("data:image/") !== 0) return;
      try { localStorage.setItem(THEME_PICTURE_KEY, JSON.stringify({ id: id, stamp: stamp || "", url: dataUrl })); } catch (e) {}
    }
    const themePictureFlights = new Map();
    function cacheThemePicture(theme) {
      if (!theme || rememberedThemePhoto(theme) || typeof theme.photo !== "string" || theme.photo.indexOf("stage-local/themes/") !== 0) return;
      const actor = authUser && authUser.id, key = (actor || "") + ":" + theme.photo;
      if (!actor || themePictureFlights.has(key)) return;
      const remote = "/api/theme-photo?id=" + encodeURIComponent(theme.id) + (/^[a-f0-9]{64}$/.test(themePhotoStamp(theme.photo)) ? "&v=" + themePhotoStamp(theme.photo) : "");
      const flight = fetch(remote, { credentials: "same-origin", cache: "no-cache" }).then((res) => {
        if (!res.ok) throw new Error("Theme picture is unavailable.");
        return res.blob();
      }).then((blob) => {
        if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) throw new Error("Invalid theme picture.");
        return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(reader.error || new Error("Could not read theme picture."));
        reader.readAsDataURL(blob);
        });
      }).then((photo) => {
        if (authUser?.id !== actor || viewAccount) return;
        const current = loadCustomThemes().find((row) => row.id === theme.id);
        if (!current || current.photo !== theme.photo) return;
        rememberThemePicture(theme.id, themePhotoStamp(theme.photo), photo);
        if (document.documentElement.dataset.paintedTheme === theme.id) paintCustomVars(document.documentElement, current);
      }).catch(() => {}).finally(() => themePictureFlights.delete(key));
      themePictureFlights.set(key, flight);
    }
    function themePhotoUrl(theme) {
      const remembered = rememberedThemePhoto(theme);
      if (remembered) return remembered;
      if (!theme || typeof theme.photo !== "string" || !theme.photo) return "";
      if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(theme.photo)) return theme.photo;
      if (/^user-[a-z0-9-]{1,80}$/.test(theme.id) && theme.photo.indexOf("stage-local/themes/") === 0) {
        const stamp = theme.photo.slice(theme.photo.lastIndexOf("/") + 1);
        return "/api/theme-photo?id=" + encodeURIComponent(theme.id) + (/^[a-f0-9]{64}$/.test(stamp) ? "&v=" + stamp : "");
      }
      return "";
    }
    function paintCustomVars(root, theme) {
      const photoUrl = themePhotoUrl(theme);
      const nextPhoto = photoUrl ? "url(" + JSON.stringify(photoUrl) + ")" : "";
      const currentPhoto = root.style.getPropertyValue("--theme-photo");
      clearCustomPaint(root, true);
      const vars = theme && theme.vars ? theme.vars : {};
      const hex = /^#[0-9A-Fa-f]{6}$/;
      const wash = /^#[0-9A-Fa-f]{8}$/;
      CUSTOM_COLOR_KEYS.forEach((key) => {
        const val = vars[key];
        if (typeof val !== "string") return;
        if (key === "--photo-wash") {
          if (wash.test(val) || hex.test(val)) root.style.setProperty(key, val);
          return;
        }
        if (hex.test(val)) root.style.setProperty(key, val);
      });
      if (vars["color-scheme"] === "dark" || vars["color-scheme"] === "light") root.style.setProperty("color-scheme", vars["color-scheme"]);
      if (nextPhoto && nextPhoto !== currentPhoto) root.style.setProperty("--theme-photo", nextPhoto);
      else if (!nextPhoto) root.style.removeProperty("--theme-photo");
    }
    function themeNameParts(name) {
      const text = String(name || "").trim();
      const match = text.match(/^(.*?)\s*(?:—|–|\s-\s)\s*(.*)$/);
      if (!match) return [text];
      const left = match[1].trim();
      const right = match[2].trim();
      if (!left || !right) return [text];
      return [left, right];
    }
    function themeNameHtml(name) {
      const parts = themeNameParts(name);
      if (parts.length < 2) return esc(parts[0]);
      return esc(parts[0]) + '<span class="theme-sub">' + esc(parts[1]) + "</span>";
    }
    function applyTheme(name, options) {
      const opts = options || {};
      if (hideStudentSongs()) { name = DEFAULT_THEME; opts.keepPainted = false; }
      const root = document.documentElement;
      let chosen;
      if (opts.keepPainted && !viewAccount && root.dataset.paintedTheme) {
        chosen = root.dataset.paintedTheme;
        const painted = chosen.indexOf("user-") === 0 ? loadCustomThemes().find((row) => row && row.id === chosen) : null;
        if (painted) cacheThemePicture(painted);
      } else {
      const stored = name && String(name).indexOf("user-") === 0 ? loadCustomThemes().find((row) => row && row.id === name) : null;
      chosen = themeCanShow(name) ? name : (!viewAccount && stored ? name : DEFAULT_THEME);
      const custom = chosen.indexOf("user-") === 0 ? loadCustomThemes().find((row) => row.id === chosen) : null;
      if (custom) {
        root.setAttribute("data-theme", "user");
        paintCustomVars(root, custom);
        cacheThemePicture(custom);
      } else {
        clearCustomPaint(root);
        root.setAttribute("data-theme", chosen);
      }
      if (!viewAccount && opts.persist !== false) root.dataset.paintedTheme = chosen;
      }
      if (opts.persist !== false && !viewAccount && themeCanShow(chosen)) {
        try { localStorage.setItem(THEME_KEY, chosen); } catch (e) {}
      }
      // Never push theme onto a viewed account; Open pages is display-only for theme.
      if (opts.sync && !viewAccount && themeCanShow(chosen)) syncChange({ op: "put-setting", key: "theme", value: chosen });
      name = chosen;
      document.querySelectorAll("[data-theme-seg] button").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.th === (name || DEFAULT_THEME) ? "true" : "false");
      });
      const sideTheme = document.getElementById("themeCycle");
      if (sideTheme) {
        const parts = themeNameParts(themeLabel(name || DEFAULT_THEME));
        sideTheme.innerHTML = '<span class="theme-side"><span class="theme-kicker">Theme</span><span class="theme-title">' + esc(parts[0] || "") + '</span><span class="theme-sub">' + esc(parts[1] || "") + "</span></span>";
      }
      paintQuizContrast();
    }
    function paintThemeSegs() {
      const mine = visibleCustomThemes().map((row) => {
        const tools = canManageOwnThemes() ? '<button type="button" class="theme-edit" data-theme-edit="' + esc(row.id) + '" aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button><button type="button" class="theme-x" data-theme-remove="' + esc(row.id) + '" aria-label="Remove">×</button>' : "";
        const bg = /^#[0-9A-Fa-f]{6}$/.test(row.bg) ? row.bg : "#CCCCCC";
        const card = /^#[0-9A-Fa-f]{6}$/.test(row.card) ? row.card : "#FFFFFF";
        const acc = /^#[0-9A-Fa-f]{6}$/.test(row.acc) ? row.acc : "#333333";
        return '<div class="theme-pick"><button type="button" data-th="' + esc(row.id) + '"><span class="sw" style="background:' + bg + '"><i style="background:' + card + '"></i><b style="background:' + acc + '"></b></span><span class="theme-name">' + themeNameHtml(row.name || "Picture") + "</span></button>" + tools + "</div>";
      }).join("");
      const themes = visibleThemes();
      const first = themes.filter((row) => row[0] === DEFAULT_THEME);
      const rest = themes.filter((row) => row[0] !== DEFAULT_THEME);
      const builtIn = first.concat(rest).map((row) => '<button type="button" data-th="' + row[0] + '"><span class="sw" style="background:' + row[2] + '"><i style="background:' + row[3] + '"></i><b style="background:' + row[4] + '"></b></span><span class="theme-name">' + themeNameHtml(row[1]) + "</span></button>");
      document.querySelectorAll("[data-theme-seg]").forEach((box) => { box.innerHTML = builtIn.slice(0, 1).join("") + mine + builtIn.slice(1).join(""); });
      const themeOpen = document.getElementById("customThemeOpen");
      if (themeOpen) themeOpen.hidden = !canManageOwnThemes();
      const themeSaveNote = document.getElementById("themeSaveNote");
      if (themeSaveNote) themeSaveNote.textContent = authUser ? "Your choice is saved to your account." : "Your choice is saved in this browser.";
      const shown = document.documentElement.getAttribute("data-theme");
      const name = shown === "user" ? currentTheme() : (shown || DEFAULT_THEME);
      document.querySelectorAll("[data-theme-seg] button").forEach((btn) => {
        btn.setAttribute("aria-pressed", btn.dataset.th === name ? "true" : "false");
      });
    }
    let editingThemeId = "";
    let themeBeforeEdit = "";
    let beginThemeEdit = function () {};
    let endThemeEdit = function () {};
    function removeCustomTheme(id) {
      if (!canManageOwnThemes() || !visibleCustomThemes().some(row => row.id === id)) return;
      const editing = editingThemeId === id;
      const active = currentTheme() === id;
      saveCustomThemes(loadCustomThemes().filter((row) => row.id !== id));
      if (editing) endThemeEdit();
      if (active) applyTheme(DEFAULT_THEME, { sync: true });
      paintThemeSegs();
    }
    function dataUrlBlob(photo) {
      const comma = String(photo || "").indexOf(",");
      const mime = (String(photo || "").slice(0, comma).match(/^data:([^;,]+)/) || [])[1] || "image/jpeg";
      const binary = atob(String(photo || "").slice(comma + 1));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    function jpegDataUrl(canvas, quality) {
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) { resolve(""); return; }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => resolve("");
          reader.readAsDataURL(blob);
        }, "image/jpeg", quality);
      });
    }
    function themeFromFile(file) {
      return createImageBitmap(file).then((bitmap) => {
        const max = 1100;
        const scale = Math.min(max / bitmap.width, max / bitmap.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        const sample = document.createElement("canvas");
        sample.width = 72;
        sample.height = Math.max(1, Math.round(72 * canvas.height / canvas.width));
        const sampleCtx = sample.getContext("2d", { willReadFrequently: true });
        sampleCtx.drawImage(canvas, 0, 0, sample.width, sample.height);
        const data = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
        }
        const palette = paletteFromPixels(pixels);
        if (!palette) return null;
        return jpegDataUrl(canvas, 0.62).then((photo) => {
          if (photo.length > 420000) return jpegDataUrl(canvas, 0.42).then((smaller) => ({ palette: palette, photo: smaller.length > 450000 ? "" : smaller }));
          return { palette: palette, photo: photo };
        });
      });
    }
    paintThemeSegs();
    document.querySelectorAll("[data-theme-seg]").forEach((box) => {
      box.addEventListener("click", (e) => {
        const edit = e.target.closest("[data-theme-edit]");
        if (edit) {
          e.preventDefault();
          if (!canManageOwnThemes()) return;
          beginThemeEdit(edit.getAttribute("data-theme-edit"));
          return;
        }
        const remove = e.target.closest("[data-theme-remove]");
        if (remove) {
          if (!canManageOwnThemes()) return;
          e.preventDefault();
          removeCustomTheme(remove.getAttribute("data-theme-remove"));
          return;
        }
        const btn = e.target.closest("[data-th]");
        if (btn) applyTheme(btn.dataset.th, { sync: true });
      });
    });
    const customThemeForm = document.getElementById("customThemeForm");
    if (customThemeForm) {
      const customThemeFile = document.getElementById("customThemeFile");
      const customThemePreview = document.getElementById("customThemePreview");
      const customThemeShot = document.getElementById("customThemeShot");
      const customThemeWash = document.getElementById("customThemeWash");
      const customThemeVeil = document.getElementById("customThemeVeil");
      const customThemeVeilOut = document.getElementById("customThemeVeilOut");
      const customThemeStatus = document.getElementById("customThemeStatus");
      let customThemePreviewUrl = "";
      function veilByte(percent) {
        return clampNum(Math.round(Number(percent) / 100 * 255), 0, 255).toString(16).padStart(2, "0");
      }
      const customThemeName = document.getElementById("customThemeName");
      const customThemeHint = document.getElementById("customThemeHint");
      const customThemeSubmit = document.getElementById("customThemeSubmit");
      const customThemeCancel = document.getElementById("customThemeCancel");
      function veilPercent(wash) {
        const alpha = parseInt(String(wash || "").slice(7, 9), 16);
        if (!Number.isFinite(alpha)) return 60;
        return clampNum(Math.round(alpha / 255 * 100), 0, 100);
      }
      function typedThemeName(list) {
        const typed = (customThemeName.value || "").trim().replace(/\s+/g, " ").slice(0, 64);
        return typed || ("Picture " + (list.length + 1));
      }
      const customThemeOpen = document.getElementById("customThemeOpen");
      function setThemeFormOpen(open) {
        customThemeForm.hidden = !open;
        if (customThemeOpen) customThemeOpen.setAttribute("aria-expanded", open ? "true" : "false");
      }
      function setThemeFormMode(editing) {
        if (customThemeSubmit) customThemeSubmit.textContent = editing ? "Save" : "Make a theme";
        if (customThemeCancel) customThemeCancel.hidden = !editing;
        if (customThemeHint) customThemeHint.textContent = editing
          ? "Change the name, the picture, or how much the picture is dimmed."
          : "Add a painting. The theme takes its colors, and the picture stays on the background, dimmed.";
      }
      function clearThemeDraft() {
        editingThemeId = "";
        themeBeforeEdit = "";
        customThemeForm.reset();
        if (customThemePreviewUrl) URL.revokeObjectURL(customThemePreviewUrl);
        customThemePreviewUrl = "";
        if (customThemeShot) customThemeShot.hidden = true;
        customThemePreview.removeAttribute("src");
        if (customThemeWash) customThemeWash.style.background = "#fff";
        setThemeFormMode(false);
        setThemeFormOpen(false);
        paintVeil();
      }
      function paintVeil() {
        const percent = customThemeVeil ? clampNum(Number(customThemeVeil.value) || 0, 0, 100) : 60;
        if (customThemeVeilOut) customThemeVeilOut.textContent = percent + "%";
        if (customThemeWash) customThemeWash.style.opacity = String(percent / 100);
        if (!editingThemeId || currentTheme() !== editingThemeId) return;
        const theme = loadCustomThemes().find((row) => row.id === editingThemeId);
        if (!theme || !theme.vars) return;
        paintCustomVars(document.documentElement, {
          id: theme.id,
          vars: Object.assign({}, theme.vars, { "--photo-wash": String(theme.vars["--bg"] || "#FFFFFF").slice(0, 7) + veilByte(percent) }),
          photo: theme.photo
        });
      }
      async function commitTheme(theme, message) {
        const list = loadCustomThemes();
        const index = list.findIndex((row) => row.id === theme.id);
        if (index >= 0) list[index] = theme;
        else list.unshift(theme);
        saveCustomThemes(list);
        paintThemeSegs();
        applyTheme(theme.id, { sync: true });
        customThemeStatus.textContent = "Saving the theme…";
        customThemeStatus.className = "hint";
        try {
          if (window.LearningMain?.flushPersonal) await window.LearningMain.flushPersonal();
          if (window.LearningMain?.themeSavePending?.()) throw new Error("The theme is saved in this browser, but the account save is not confirmed. Retry before signing out.");
          if (window.LearningMain?.themePreferences) applyAccountThemes(window.LearningMain.themePreferences());
          clearThemeDraft();
          customThemeStatus.textContent = message;
        } catch (error) {
          customThemeStatus.textContent = error.message;
          customThemeStatus.className = "hint bad";
        } finally {
          if (customThemeSubmit) customThemeSubmit.disabled = false;
        }
      }
      function storeTheme(theme, message) {
        theme.owner = authUser && authUser.login ? authUser.login : "";
        if (viewAccount) {
          idbGetStash().then((snap) => {
            if (!snap) return;
            let kept = [];
            try { kept = JSON.parse(snap[CUSTOM_THEME_KEY] || "[]"); } catch (e) { kept = []; }
            if (!Array.isArray(kept)) kept = [];
            const at = kept.findIndex((row) => row && row.id === theme.id);
            if (at >= 0) kept[at] = theme;
            else kept.unshift(theme);
            snap[CUSTOM_THEME_KEY] = JSON.stringify(kept.slice(0, 16));
            return idbPutStash(snap);
          }).catch(() => {});
          clearThemeDraft();
          customThemeStatus.textContent = message;
          customThemeStatus.className = "hint";
          if (customThemeSubmit) customThemeSubmit.disabled = false;
          return;
        }
        const photo = theme.photo;
        const actor = authUser?.id;
        const upload = window.LearningMain && typeof window.LearningMain.uploadThemePhoto === "function"
          && typeof photo === "string" && photo.indexOf("data:image/") === 0;
        if (!upload) {
          commitTheme(theme, message);
          return;
        }
        customThemeStatus.textContent = "Saving the picture…";
        customThemeStatus.className = "hint";
        Promise.resolve(dataUrlBlob(photo)).then((blob) => window.LearningMain.uploadThemePhoto(theme.id, blob)).then((result) => {
          if (authUser?.id !== actor || viewAccount) throw new Error("The account changed before the theme was saved.");
          if (!result || typeof result.photo !== "string" || result.photo.indexOf("stage-local/themes/") !== 0) throw new Error("The picture could not be saved.");
          rememberThemePicture(theme.id, themePhotoStamp(result.photo), photo);
          theme.photo = result.photo;
          delete theme.photoKey;
          commitTheme(theme, message);
        }).catch((error) => {
          customThemeStatus.textContent = error && error.message ? error.message : "The picture could not be saved.";
          customThemeStatus.className = "hint bad";
          if (customThemeSubmit) customThemeSubmit.disabled = false;
        });
      }
      beginThemeEdit = function (id) {
        if (!canManageOwnThemes() || !visibleCustomThemes().some(row => row.id === id)) return;
        const theme = loadCustomThemes().find((row) => row.id === id);
        if (!theme) return;
        if (!editingThemeId) themeBeforeEdit = currentTheme();
        editingThemeId = id;
        customThemeName.value = theme.name || "";
        if (customThemeVeil) customThemeVeil.value = String(veilPercent(theme.vars && theme.vars["--photo-wash"]));
        if (customThemePreviewUrl) URL.revokeObjectURL(customThemePreviewUrl);
        customThemePreviewUrl = "";
        customThemeFile.value = "";
        const savedPhoto = themePhotoUrl(theme);
        if (savedPhoto) {
          customThemePreview.src = savedPhoto;
          if (customThemeShot) customThemeShot.hidden = false;
        } else if (customThemeShot) {
          customThemeShot.hidden = true;
          customThemePreview.removeAttribute("src");
        }
        if (customThemeWash && theme.vars && theme.vars["--bg"]) customThemeWash.style.background = theme.vars["--bg"];
        setThemeFormMode(true);
        customThemeStatus.textContent = "";
        customThemeStatus.className = "hint";
        applyTheme(id);
        paintVeil();
        setThemeFormOpen(true);
        customThemeForm.scrollIntoView({ block: "nearest" });
      };
      endThemeEdit = function () {
        const back = themeBeforeEdit;
        clearThemeDraft();
        if (back) applyTheme(back);
      };
      paintVeil();
      if (customThemeOpen) customThemeOpen.addEventListener("click", () => {
        if (!customThemeForm.hidden && editingThemeId) {
          endThemeEdit();
          setThemeFormOpen(true);
          if (customThemeName) customThemeName.focus();
          return;
        }
        if (!customThemeForm.hidden) {
          endThemeEdit();
          return;
        }
        setThemeFormOpen(true);
        if (customThemeName) customThemeName.focus();
      });
      if (customThemeVeil) customThemeVeil.addEventListener("input", paintVeil);
      if (customThemeCancel) customThemeCancel.addEventListener("click", endThemeEdit);
      customThemeFile.addEventListener("change", () => {
        if (customThemePreviewUrl) URL.revokeObjectURL(customThemePreviewUrl);
        customThemePreviewUrl = "";
        const file = customThemeFile.files && customThemeFile.files[0];
        if (!file) return;
        customThemePreviewUrl = URL.createObjectURL(file);
        customThemePreview.src = customThemePreviewUrl;
        if (customThemeShot) customThemeShot.hidden = false;
        if (customThemeWash && !editingThemeId) customThemeWash.style.background = "#fff";
        paintVeil();
        customThemeStatus.textContent = "";
        customThemeStatus.className = "hint";
      });
      customThemeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const file = customThemeFile.files && customThemeFile.files[0];
        const existing = editingThemeId ? loadCustomThemes().find((row) => row.id === editingThemeId) : null;
        if (file && file.size > 15 * 1024 * 1024) {
          customThemeStatus.textContent = "This picture is too large.";
          customThemeStatus.className = "hint bad";
          return;
        }
        if (!file && !existing) {
          customThemeStatus.textContent = "Choose a picture first.";
          customThemeStatus.className = "hint bad";
          return;
        }
        const submit = customThemeSubmit;
        if (submit) submit.disabled = true;
        const percent = customThemeVeil ? customThemeVeil.value : 60;
        const done = (theme, message) => {
          storeTheme(theme, message);
        };
        const fail = () => {
          customThemeStatus.textContent = "This picture could not be read.";
          customThemeStatus.className = "hint bad";
          if (submit) submit.disabled = false;
        };
        if (!file && existing) {
          const vars = Object.assign({}, existing.vars, { "--photo-wash": String(existing.vars["--bg"] || existing.bg || "#FFFFFF").slice(0, 7) + veilByte(percent) });
          done(Object.assign({}, existing, { name: typedThemeName(loadCustomThemes()), vars: vars }), "Theme saved.");
          return;
        }
        customThemeStatus.textContent = "Reading the picture…";
        customThemeStatus.className = "hint";
        themeFromFile(file).then((made) => {
          if (!made || !made.palette) throw new Error("empty");
          const list = loadCustomThemes();
          made.palette.vars["--photo-wash"] = made.palette.vars["--bg"] + veilByte(percent);
          const ownerLogin = authUser && authUser.login ? authUser.login : "";
          done({
            id: existing ? existing.id : "user-" + Date.now().toString(36),
            name: typedThemeName(list),
            bg: made.palette.bg,
            card: made.palette.card,
            acc: made.palette.acc,
            vars: made.palette.vars,
            photo: made.photo || (existing && existing.photo) || "",
            owner: ownerLogin
          }, existing ? "Theme saved." : (made.photo ? "Theme added." : "Theme added. The picture was too heavy to keep as a background."));
        }).catch(fail);
      });
    }
    function cycleTheme() {
      const now = currentTheme();
      const builtIn = visibleThemes();
      const first = builtIn.filter((row) => row[0] === DEFAULT_THEME);
      const rest = builtIn.filter((row) => row[0] !== DEFAULT_THEME);
      const choices = first.map((row) => row[0]).concat(visibleCustomThemes().map((row) => row.id), rest.map((row) => row[0])).filter((name) => name !== now);
      if (!choices.length) return;
      applyTheme(choices[Math.floor(Math.random() * choices.length)], { sync: true });
    }
    document.querySelectorAll("[data-theme-cycle]").forEach((btn) => btn.addEventListener("click", cycleTheme));
