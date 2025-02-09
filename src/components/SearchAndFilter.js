import { Button, Icon, SearchField } from '@folio/stripes/components';
import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';

const SearchAndFilter = ({ setSearchParams }) => {
  const intl = useIntl();
  const [query, setQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState('');

  const indexMapList = [
    { "label" : "All-Fields", "index" : "" },
    { "label" : "Title", "index" : "@attr 1=4" },
    { "label" : "Subject", "index" : "@attr 1=21" }
  ];

  const handleQuery = q => setQuery(q?.target?.value);
  const handleSubmit = e => {
    e.preventDefault();
    e.stopPropagation();
    /*
    setSearchParams({
      lookfor: query,
      type: searchIndex,
    });
    */
    setSearchParams({
      "x-pquery" : `${searchIndex} "${query}"`,
    });
  };
  return (
    <form onSubmit={handleSubmit}>
      <SearchField
        autoFocus
        name="query"
        onChange={handleQuery}
        onClear={() => setQuery('')}
        value={query}
        searchableIndexes={indexMapList.map(i => ( { value: i.index, label: intl.formatMessage({ id:`ui-plugin-rs-siquery-metaproxy.index.${i.label}` }) }))}
        selectedIndex={searchIndex}
        onChangeIndex={e => setSearchIndex(e?.target?.value)}
      />
      <Button
        buttonStyle="primary"
        disabled={!query}
        fullWidth
        type="submit"
      >
        <FormattedMessage id="stripes-smart-components.search" />
      </Button>
      <Button
        buttonStyle="none"
        id="clickable-reset-all"
        fullWidth
        onClick={() => setQuery('')}
      >
        <Icon icon="times-circle-solid">
          <FormattedMessage id="stripes-smart-components.resetAll" />
        </Icon>
      </Button>
    </form>
  );
};
export default SearchAndFilter;
