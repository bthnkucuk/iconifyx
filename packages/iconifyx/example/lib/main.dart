import 'package:flutter/material.dart';
import 'package:iconifyx_core/iconifyx_core.dart';

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
  // Filter for icons within the currently-selected set.
  String _iconFilter = '';
  // Independent filter for the drawer: matches against set name or prefix.
  String _setFilter = '';

  @override
  void initState() {
    super.initState();
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
    if (_iconFilter.isEmpty) return set.icons;
    final f = _iconFilter.toLowerCase();
    return set.icons.where((i) => i.name.toLowerCase().contains(f)).toList();
  }

  /// Returns categories with only the sets that match the drawer filter.
  /// Categories whose sets all filtered out are dropped entirely.
  List<ExampleCategory> get _visibleCategories {
    if (_setFilter.isEmpty) return exampleCategories;
    final f = _setFilter.toLowerCase();
    final out = <ExampleCategory>[];
    for (final category in exampleCategories) {
      final matching = category.sets.where((s) {
        return s.name.toLowerCase().contains(f) ||
            s.prefix.toLowerCase().contains(f);
      }).toList();
      if (matching.isNotEmpty) {
        out.add(ExampleCategory(name: category.name, sets: matching));
      }
    }
    return out;
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selectedSet;
    final icons = _visibleIcons;
    final categories = _visibleCategories;
    final crossAxis = MediaQuery.sizeOf(context).width ~/ 96;
    final hasMatch = categories.isNotEmpty;

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
              onChanged: (v) => setState(() => _iconFilter = v),
            ),
          ),
        ),
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              const DrawerHeader(
                child: Center(
                  child: Text('Icon sets', style: TextStyle(fontSize: 22)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: TextField(
                  decoration: InputDecoration(
                    isDense: true,
                    prefixIcon: const Icon(Icons.search),
                    hintText: 'Search sets…',
                    border: const OutlineInputBorder(),
                    suffixIcon: _setFilter.isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () =>
                                setState(() => _setFilter = ''),
                          ),
                  ),
                  onChanged: (v) => setState(() => _setFilter = v),
                ),
              ),
              Expanded(
                child: hasMatch
                    ? ListView(
                        children: [
                          for (final category in categories) ...[
                            Padding(
                              padding:
                                  const EdgeInsets.fromLTRB(16, 16, 16, 4),
                              child: Text(
                                category.name,
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold),
                              ),
                            ),
                            for (final set in category.sets)
                              ListTile(
                                selected: identical(set, selected),
                                dense: true,
                                title: Text(set.name),
                                subtitle: Text(
                                    '${set.prefix} · ${set.icons.length} icons · ${set.license}'),
                                onTap: () {
                                  setState(() {
                                    _selectedSet = set;
                                    _iconFilter = '';
                                  });
                                  Navigator.of(context).pop();
                                },
                              ),
                          ],
                        ],
                      )
                    : Center(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Text(
                            'No sets match "$_setFilter".',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      ),
              ),
            ],
          ),
        ),
      ),
      body: selected == null
          ? const Center(child: Text('No sets bundled.'))
          : icons.isEmpty
              ? Center(child: Text('No icons match "$_iconFilter".'))
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
                child: entry.isDuotone
                    ? IconifyDuotoneIcon(entry.data, entry.secondary!,
                        size: 36)
                    : Icon(entry.data.data, size: 36),
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
