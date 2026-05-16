import 'package:flutter/material.dart';
import 'package:iconifyx_core/iconifyx_core.dart';
import 'package:iconifyx_mdi/iconifyx_mdi.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';
import 'package:iconifyx_tabler/iconifyx_tabler.dart';
import 'package:iconifyx_ph/iconifyx_ph.dart';
import 'package:iconifyx_ic/iconifyx_ic.dart';
import 'package:iconifyx_solar/iconifyx_solar.dart';
import 'package:iconifyx_iconoir/iconifyx_iconoir.dart';
import 'package:iconifyx_carbon/iconifyx_carbon.dart';
import 'package:iconifyx_feather/iconifyx_feather.dart';
import 'package:iconifyx_heroicons/iconifyx_heroicons.dart';

void main() => runApp(MaterialApp(home: Scaffold(body: Center(
  child: Wrap(spacing: 16, children: [
    // 5 icons × 10 packs = 50 icons total. Packs that ship Secondary
    // TTFs (Ph / Solar / Ic — duotone families) include at least one
    // `.duo`-constructor icon so const_finder traverses BOTH primary
    // and secondary IconData references. Without a Secondary
    // reference, `font-subset` is never invoked on the Secondary TTF
    // and Flutter bundles the on-disk file at full size (425 KB for
    // SolarSecondary etc.) → treeshake-regression CI gate fails.
    //
    // `MdiIcons.search` was an alias of `magnify` in upstream Iconify;
    // after §22 Rec 1 aliases live in `mdiAliases` and the canonical
    // name is the const that survives on the class.
    for (final i in [MdiIcons.home, MdiIcons.magnify, MdiIcons.account, MdiIcons.menu, MdiIcons.heart]) IconifyIcon(i, size: 48),
    for (final i in [LucideIcons.house, LucideIcons.search, LucideIcons.user, LucideIcons.menu, LucideIcons.heart]) IconifyIcon(i, size: 48),
    for (final i in [TablerIcons.home, TablerIcons.search, TablerIcons.user, TablerIcons.menu2, TablerIcons.heart]) IconifyIcon(i, size: 48),
    // Phosphor — 4 solo + 1 hint-duotone → PhSecondary.ttf subsetted.
    for (final i in [PhIcons.house, PhIcons.user, PhIcons.gear, PhIcons.heart, PhIcons.acornDuotone]) IconifyIcon(i, size: 48),
    // ic — 4 solo + 1 hint-duotone → IcSecondary.ttf subsetted.
    for (final i in [IcIcons.baselineHome, IcIcons.baselineSearch, IcIcons.baselineMenu, IcIcons.baselineFavorite, IcIcons.baselineBattery20]) IconifyIcon(i, size: 48),
    // Solar — 4 solo + 1 bold-duotone → SolarSecondary.ttf subsetted.
    for (final i in [SolarIcons.homeOutline, SolarIcons.userOutline, SolarIcons.menuDotsOutline, SolarIcons.heartOutline, SolarIcons.heartBoldDuotone]) IconifyIcon(i, size: 48),
    for (final i in [IconoirIcons.home, IconoirIcons.search, IconoirIcons.user, IconoirIcons.menu, IconoirIcons.heartSolid]) IconifyIcon(i, size: 48),
    for (final i in [CarbonIcons.home, CarbonIcons.search, CarbonIcons.user, CarbonIcons.menu, CarbonIcons.favorite]) IconifyIcon(i, size: 48),
    for (final i in [FeatherIcons.home, FeatherIcons.search, FeatherIcons.user, FeatherIcons.menu, FeatherIcons.heart]) IconifyIcon(i, size: 48),
    for (final i in [HeroiconsIcons.home, HeroiconsIcons.magnifyingGlass, HeroiconsIcons.user, HeroiconsIcons.bars3, HeroiconsIcons.heart]) IconifyIcon(i, size: 48),
  ]),
))));
