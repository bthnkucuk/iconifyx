import 'package:flutter/material.dart';

import 'generated_index.dart';

void main() {
  runApp(const IconifyxExampleApp());
}

class IconifyxExampleApp extends StatelessWidget {
  const IconifyxExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'iconifyx',
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.deepPurple),
      ),
      home: const SetBrowserPage(),
    );
  }
}

class SetBrowserPage extends StatefulWidget {
  const SetBrowserPage({super.key});

  @override
  State<SetBrowserPage> createState() => _SetBrowserPageState();
}

class _SetBrowserPageState extends State<SetBrowserPage> {
  ExampleSetEntry? _selectedSet;
  String _filter = '';

  @override
  void initState() {
    super.initState();
    // Pick the first set by default.
    for (final category in exampleCategories) {
      if (category.sets.isNotEmpty) {
        _selectedSet = category.sets.first;
        break;
      }
    }
  }

  List<ExampleIconEntry> get _visibleIcons {
    final set = _selectedSet;
    if (set == null) return const [];
    if (_filter.isEmpty) return set.icons;
    final f = _filter.toLowerCase();
    return set.icons.where((i) => i.name.toLowerCase().contains(f)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selectedSet;
    final icons = _visibleIcons;
    final crossAxis = MediaQuery.sizeOf(context).width ~/ 96;

    return Scaffold(
      appBar: AppBar(
        title: Text(selected?.name ?? 'iconifyx'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            child: TextField(
              decoration: const InputDecoration(
                isDense: true,
                prefixIcon: Icon(Icons.search),
                hintText: 'Filter icons in this set…',
                border: OutlineInputBorder(),
              ),
              onChanged: (v) => setState(() => _filter = v),
            ),
          ),
        ),
      ),
      drawer: Drawer(
        child: SafeArea(
          child: ListView(
            children: [
              const DrawerHeader(
                child: Center(
                  child: Text('Icon sets', style: TextStyle(fontSize: 22)),
                ),
              ),
              for (final category in exampleCategories) ...[
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Text(
                    category.name,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                ),
                for (final set in category.sets)
                  ListTile(
                    selected: identical(set, selected),
                    dense: true,
                    title: Text(set.name),
                    subtitle:
                        Text('${set.icons.length} icons · ${set.license}'),
                    onTap: () {
                      setState(() {
                        _selectedSet = set;
                        _filter = '';
                      });
                      Navigator.of(context).pop();
                    },
                  ),
              ],
            ],
          ),
        ),
      ),
      body: selected == null
          ? const Center(child: Text('No sets bundled.'))
          : icons.isEmpty
              ? Center(child: Text('No icons match "$_filter".'))
              : GridView.builder(
                  padding: const EdgeInsets.all(12),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: crossAxis.clamp(2, 8),
                    childAspectRatio: 1,
                  ),
                  itemCount: icons.length,
                  itemBuilder: (context, i) {
                    final ic = icons[i];
                    return IconTile(entry: ic);
                  },
                ),
    );
  }
}

class IconTile extends StatelessWidget {
  final ExampleIconEntry entry;
  const IconTile({super.key, required this.entry});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: () {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            duration: const Duration(seconds: 1),
            content: Text(
                '${entry.name} · 0x${entry.data.codePoint.toRadixString(16)}'),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: Icon(entry.data.data, size: 36),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              entry.name,
              style: const TextStyle(fontSize: 10),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
