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
        appBar: AppBar(title: const Text('Two-icon bundle size test')),
        body: Center(
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: [
              Icon(MdiIcons.home.data, size: 64),
              Icon(LucideIcons.house.data, size: 64),
            ],
          ),
        ),
      ),
    );
  }
}
