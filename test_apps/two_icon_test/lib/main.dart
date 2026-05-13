import 'package:flutter/material.dart';
import 'package:iconifyx_core/iconifyx_core.dart';
import 'package:iconifyx_mdi/iconifyx_mdi.dart';
import 'package:iconifyx_lucide/iconifyx_lucide.dart';
import 'package:iconifyx_ph/iconifyx_ph.dart';

void main() => runApp(const TwoIconApp());

class TwoIconApp extends StatelessWidget {
  const TwoIconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        appBar: AppBar(title: const Text('iconifyx visual checks')),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: [
            _section(
              'Material (filled, already correct)',
              [
                Icon(MdiIcons.home.data, size: 64),
                Icon(MdiIcons.heart.data, size: 64),
                Icon(MdiIcons.magnify.data, size: 64),
              ],
            ),
            _section(
              'Lucide (stroke→fill processed)',
              [
                Icon(LucideIcons.alarmClockCheck.data, size: 64),
                Icon(LucideIcons.house.data, size: 64),
                Icon(LucideIcons.heart.data, size: 64),
                Icon(LucideIcons.search.data, size: 64),
              ],
            ),
            _section(
              'Phosphor regular (filled, from same package as duotone)',
              [
                Icon(PhIcons.acorn.data, size: 64),
                Icon(PhIcons.house.data, size: 64),
                Icon(PhIcons.heart.data, size: 64),
                Icon(PhIcons.addressBook.data, size: 64),
              ],
            ),
            _section(
              'Phosphor duotone — default secondary 40% opacity',
              [
                IconifyDuotoneIcon(
                  PhIcons.acornDuotonePrimary,
                  PhIcons.acornDuotoneSecondary,
                  size: 64,
                ),
                IconifyDuotoneIcon(
                  PhIcons.houseDuotonePrimary,
                  PhIcons.houseDuotoneSecondary,
                  size: 64,
                ),
                IconifyDuotoneIcon(
                  PhIcons.heartDuotonePrimary,
                  PhIcons.heartDuotoneSecondary,
                  size: 64,
                ),
                IconifyDuotoneIcon(
                  PhIcons.addressBookDuotonePrimary,
                  PhIcons.addressBookDuotoneSecondary,
                  size: 64,
                ),
              ],
            ),
            _section(
              'Phosphor duotone — custom colors (primary blue / secondary red @50%)',
              [
                IconifyDuotoneIcon(
                  PhIcons.acornDuotonePrimary,
                  PhIcons.acornDuotoneSecondary,
                  size: 64,
                  primaryColor: Colors.blue,
                  secondaryColor: Colors.red,
                  secondaryOpacity: 0.5,
                ),
                IconifyDuotoneIcon(
                  PhIcons.houseDuotonePrimary,
                  PhIcons.houseDuotoneSecondary,
                  size: 64,
                  primaryColor: Colors.indigo,
                  secondaryColor: Colors.orange,
                  secondaryOpacity: 0.6,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> children) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Wrap(spacing: 16, runSpacing: 16, children: children),
        ],
      ),
    );
  }
}
