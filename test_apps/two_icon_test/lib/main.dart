import 'package:flutter/material.dart';
import 'package:iconifyx_mdi/iconifyx_mdi.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';

void main() => runApp(const TwoIconApp());

class TwoIconApp extends StatelessWidget {
  const TwoIconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('Lucide stroke-fill verification')),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Lucide (stroke→fill processed):',
                  style: TextStyle(fontSize: 16)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                children: [
                  Icon(LucideIcons.alarmClockCheck.data, size: 64),
                  Icon(LucideIcons.house.data, size: 64),
                  Icon(LucideIcons.heart.data, size: 64),
                  Icon(LucideIcons.search.data, size: 64),
                  Icon(LucideIcons.user.data, size: 64),
                ],
              ),
              const SizedBox(height: 24),
              const Text('Material Design Icons (already filled):',
                  style: TextStyle(fontSize: 16)),
              const SizedBox(height: 12),
              Wrap(
                spacing: 16,
                children: [
                  Icon(MdiIcons.home.data, size: 64),
                  Icon(MdiIcons.heart.data, size: 64),
                  Icon(MdiIcons.magnify.data, size: 64),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
