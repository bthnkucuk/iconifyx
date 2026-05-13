import 'package:flutter/material.dart';
import 'package:iconifyx_core/iconifyx_core.dart';
import 'package:iconifyx_ic/iconifyx_ic.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';
import 'package:iconifyx_ph/iconifyx_ph.dart';

void main() => runApp(const TwoIconApp());

class TwoIconApp extends StatelessWidget {
  const TwoIconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('3 Lucide + 5 Phosphor tree-shake test')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Lucide (3 icons)'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                children: [
                  Icon(LucideIcons.house.data, size: 48),
                  Icon(LucideIcons.search.data, size: 48),
                  Icon(LucideIcons.heart.data, size: 48),
                ],
              ),
              const SizedBox(height: 32),
              const Text('Phosphor (5 icons)'),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                children: [
                  Icon(PhIcons.house.data, size: 48),
                  Icon(PhIcons.heart.data, size: 48),
                  Icon(PhIcons.user.data, size: 48),
                  Icon(PhIcons.gear.data, size: 48),
                  Icon(PhIcons.shoppingCart.data, size: 48),
                ],
              ),
              const SizedBox(height: 32),
              const Text('Duotone position test (ic baseline-signal-wifi-1-bar-lock)'),
              const SizedBox(height: 12),
              IconifyDuotoneIcon(
                IcIcons.baselineSignalWifi1BarLockPrimary,
                IcIcons.baselineSignalWifi1BarLockSecondary,
                size: 96,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
