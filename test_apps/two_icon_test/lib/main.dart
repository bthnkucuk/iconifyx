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
        appBar: AppBar(title: const Text('IconifyIcon API check')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Regular icons (Lucide)'),
              const SizedBox(height: 8),
              Wrap(spacing: 16, children: [
                IconifyIcon(LucideIcons.house, size: 48),
                IconifyIcon(LucideIcons.search, size: 48),
                IconifyIcon(LucideIcons.heart, size: 48),
              ]),
              const SizedBox(height: 24),
              const Text('Regular icons (Phosphor)'),
              const SizedBox(height: 8),
              Wrap(spacing: 16, children: [
                IconifyIcon(PhIcons.house, size: 48),
                IconifyIcon(PhIcons.user, size: 48),
                IconifyIcon(PhIcons.gear, size: 48),
              ]),
              const SizedBox(height: 24),
              const Text('Duotone (Phosphor) — auto'),
              const SizedBox(height: 8),
              Wrap(spacing: 16, children: [
                IconifyIcon(PhIcons.acornDuotone, size: 64),
                IconifyIcon(PhIcons.houseDuotone, size: 64),
                IconifyIcon(PhIcons.heartDuotone, size: 64),
              ]),
              const SizedBox(height: 24),
              const Text('Duotone with custom colors (.duotone constructor)'),
              const SizedBox(height: 8),
              Wrap(spacing: 16, children: [
                IconifyIcon.duotone(
                  PhIcons.acornDuotone,
                  size: 64,
                  color: Colors.blue,
                  secondaryColor: Colors.red,
                  secondaryOpacity: 0.5,
                ),
                IconifyIcon.duotone(
                  PhIcons.heartDuotone,
                  size: 64,
                  color: Colors.indigo,
                  secondaryColor: Colors.orange,
                  secondaryOpacity: 0.6,
                ),
              ]),
              const SizedBox(height: 24),
              const Text('Duotone with off-centre layers (ic signal-wifi-1-bar-lock)'),
              const SizedBox(height: 8),
              IconifyIcon(IcIcons.baselineSignalWifi1BarLock, size: 96),
            ],
          ),
        ),
      ),
    );
  }
}
